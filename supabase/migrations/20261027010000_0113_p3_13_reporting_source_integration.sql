-- P3.13: reconcile P3.12 operational reporting with integrated domain sources.
-- PostgreSQL 17 treats the original unqualified output-column names as ambiguous.
create or replace function public.p309_consume_plan_allowance(
  p_tenant_id uuid, p_operation_id uuid, p_allowance_key text, p_amount bigint,
  p_source text, p_source_id uuid default null
) returns table(status text,snapshot_id uuid,used bigint,allowance_limit bigint,replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare v_subscription public.subscriptions%rowtype; v_snapshot public.subscription_period_snapshots%rowtype;
  v_existing public.subscription_allowance_operations%rowtype; v_limit bigint; v_used bigint; v_addons jsonb; v_allowances jsonb; v_status text;
begin
  if p_amount <= 0 or p_allowance_key not in ('employees','storage_bytes','invoices','sms','whatsapp','advanced_reports','finance_exports') or p_source !~ '^[a-z][a-z0-9_]{0,31}$' then
    raise exception 'VALIDATION_FAILED' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.subscription_allowance_operations as operation where operation.operation_id=p_operation_id;
  if found then
    if v_existing.tenant_id<>p_tenant_id or v_existing.allowance_key<>p_allowance_key or v_existing.amount<>p_amount or v_existing.source<>p_source or v_existing.source_id is distinct from p_source_id then raise exception 'OPERATION_REUSED' using errcode='P3099'; end if;
    return query select v_existing.status,v_existing.snapshot_id,v_existing.used,v_existing.allowance_limit,true; return;
  end if;
  select * into v_subscription from public.subscriptions as subscription where subscription.tenant_id=p_tenant_id for update;
  if not found or v_subscription.catalog_version_id is null or v_subscription.current_period_start is null or v_subscription.current_period_end is null
     or not (v_subscription.status in ('active','trialing') or (v_subscription.status='past_due' and v_subscription.grace_until>now())) then
    insert into public.subscription_allowance_operations values(p_operation_id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,'provider_unavailable',null,0,0,now());
    return query select 'provider_unavailable'::text,null::uuid,0::bigint,0::bigint,false; return;
  end if;
  select coalesce(jsonb_object_agg(allowance.allowance_key,allowance.allowance_value),'{}'::jsonb) into v_allowances
  from public.subscription_plan_allowances as allowance
  where allowance.catalog_version_id=v_subscription.catalog_version_id and allowance.plan_key=v_subscription.plan;
  select coalesce(jsonb_object_agg(addon.allowance_key,addon.total),'{}'::jsonb) into v_addons from (
    select catalog_addon.allowance_key,sum(catalog_addon.allowance_delta*assignment.quantity)::bigint total
    from public.subscription_addon_assignments as assignment
    join public.subscription_addons as catalog_addon on catalog_addon.catalog_version_id=assignment.catalog_version_id and catalog_addon.addon_key=assignment.addon_key
    where assignment.subscription_id=v_subscription.id and assignment.effective_from<v_subscription.current_period_end and (assignment.effective_to is null or assignment.effective_to>v_subscription.current_period_start)
    group by catalog_addon.allowance_key
  ) as addon;
  insert into public.subscription_period_snapshots(subscription_id,tenant_id,catalog_version_id,plan_key,cadence,subscription_status,period_start,period_end,grace_until,allowances,addon_deltas)
  values(v_subscription.id,p_tenant_id,v_subscription.catalog_version_id,v_subscription.plan,coalesce(v_subscription.cadence,case v_subscription.interval when 'year' then 'annual' else 'monthly' end),v_subscription.status,v_subscription.current_period_start,v_subscription.current_period_end,v_subscription.grace_until,v_allowances,v_addons)
  on conflict(subscription_id,period_start,period_end) do nothing;
  select * into v_snapshot from public.subscription_period_snapshots as snapshot where snapshot.subscription_id=v_subscription.id and snapshot.period_start=v_subscription.current_period_start and snapshot.period_end=v_subscription.current_period_end for update;
  v_limit := case when p_allowance_key='finance_exports' then case coalesce((v_snapshot.allowances->>'advanced_reports')::bigint,0) when 1 then 9223372036854775807 else 0 end
                  else coalesce((v_snapshot.allowances->>p_allowance_key)::bigint,0)+coalesce((v_snapshot.addon_deltas->>p_allowance_key)::bigint,0) end;
  select coalesce(sum(usage.amount),0) into v_used
  from public.subscription_usage as usage
  where usage.snapshot_id=v_snapshot.id and usage.allowance_key=p_allowance_key;
  v_status := case when v_used+p_amount>v_limit then 'limit_reached' else 'allowed' end;
  if v_status='allowed' then insert into public.subscription_usage(snapshot_id,tenant_id,allowance_key,amount,source,source_id,operation_id) values(v_snapshot.id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,p_operation_id); v_used:=v_used+p_amount; end if;
  insert into public.subscription_allowance_operations values(p_operation_id,p_tenant_id,p_allowance_key,p_amount,p_source,p_source_id,v_status,v_snapshot.id,v_used,v_limit,now());
  return query select v_status,v_snapshot.id,v_used,v_limit,false;
end $$;
revoke all on function public.p309_consume_plan_allowance(uuid,uuid,text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.p309_consume_plan_allowance(uuid,uuid,text,bigint,text,uuid) to service_role;

create or replace function public.read_p3_12_operational_report(
  p_actor_id uuid, p_scope text, p_company_id uuid, p_operation_id uuid, p_correlation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_tenant_id uuid;
  v_allowed boolean := false;
  v_source_freshness jsonb;
  v_result jsonb;
begin
  select * into v_actor from public.profiles where id = p_actor_id and status::text = 'active';
  if not found then raise exception using errcode='42501', message='REPORT_ACCESS_DENIED'; end if;
  if p_scope = 'platform' then
    v_allowed := v_actor.role::text in ('admin','super_admin') and v_actor.tenant_id is null;
  elsif p_scope = 'company' and p_company_id is not null then
    select tenant_id into v_tenant_id from public.company_profiles where id = p_company_id;
    if v_actor.role::text in ('admin','super_admin') and v_actor.tenant_id is null then
      v_allowed := true;
    elsif v_actor.role::text = 'pro' then
      v_allowed := exists(
        select 1 from public.pro_company_assignments a
        where a.pro_profile_id=p_actor_id and a.company_id=p_company_id and a.status::text='active'
      );
    elsif v_actor.role::text = 'customer' then
      v_allowed := v_actor.tenant_id=v_tenant_id and exists(
        select 1 from public.customer_profiles c
        where c.profile_id=p_actor_id and c.linked_company_id=p_company_id
      );
    end if;
  end if;
  if not v_allowed then raise exception using errcode='42501', message='REPORT_ACCESS_DENIED'; end if;

  v_source_freshness := jsonb_build_object(
    'local',statement_timestamp(),
    'p306',statement_timestamp(),
    'p309',statement_timestamp()
  );
  if p_scope = 'platform' then
    v_source_freshness := v_source_freshness || jsonb_build_object('p305',statement_timestamp());
  end if;

  select jsonb_build_object(
    'reportVersion',1,
    'scope',p_scope,
    'generatedAt',statement_timestamp(),
    'businessTimezone','Asia/Dubai',
    'state','partial',
    'counts',jsonb_build_object(
      'companies',(select count(*) from public.company_profiles c where p_scope='platform' or c.id=p_company_id),
      'activeEmployees',(select count(*) from public.employees e where e.status::text='active' and (p_scope='platform' or e.company_id=p_company_id)),
      'overdueRenewals',(select count(*) from public.renewals r where r.status::text='overdue' and (p_scope='platform' or r.company_id=p_company_id)),
      'scheduledMeetings',(select count(*) from public.meetings m where m.status::text='scheduled' and (p_scope='platform' or m.company_id=p_company_id)),
      'contactIntakes',(select case when p_scope='platform' then count(*) else 0 end from public.public_contact_intakes),
      'submittedApplications',(select case when p_scope='platform' then count(*) else 0 end from public.public_applications),
      'registrations',(select count(*) from public.company_registrations r where p_scope='platform' or r.company_id=p_company_id),
      'postedFinanceJournals',(select count(*) from public.finance_journals j where j.state='posted' and (p_scope='platform' or j.company_id=p_company_id))
    ),
    'sourceFreshness',v_source_freshness,
    'unavailableSources',jsonb_build_array('P3_10_RUNTIME_PENDING')
  ) into v_result;

  insert into public.data_access_events(
    event_name,actor_id,tenant_id,company_id,resource_type,target_opaque_id,outcome,reason_code,
    operation_id,correlation_id,source_class,safe_metadata
  ) values (
    'access.report.read',p_actor_id,v_tenant_id,p_company_id,'report',
    encode(extensions.digest(p_scope || ':' || coalesce(p_company_id::text,'platform'),'sha256'),'hex'),
    'granted','REPORT_AUTHORIZED',p_operation_id,p_correlation_id,'page',
    jsonb_build_object('report_id',p_scope || '-operations','version',1,'sources',jsonb_build_array('local','p305','p306','p309'))
  );
  return v_result;
end;
$$;
revoke all on function public.read_p3_12_operational_report(uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_p3_12_operational_report(uuid,text,uuid,uuid,uuid) to service_role;
