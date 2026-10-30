begin;

create function public.p3_12_metadata_is_safe(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and pg_catalog.octet_length(value::text) <= 4096
    and value::text !~* '"([^" ]*(password|secret|token|credential|passport|emirates|phone|email|storage_path|signed_url|request_body|provider_payload|database_error)[^" ]*)"[[:space:]]*:';
$$;

revoke all on function public.p3_12_metadata_is_safe(jsonb) from public, anon, authenticated;
grant execute on function public.p3_12_metadata_is_safe(jsonb) to service_role;

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_.]{2,79}$'),
  event_version smallint not null default 1 check (event_version = 1),
  actor_id uuid references public.profiles(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  action text not null check (char_length(action) between 3 and 80),
  target_type text not null check (target_type ~ '^[a-z][a-z0-9_]{1,39}$'),
  target_opaque_id text check (target_opaque_id is null or char_length(target_opaque_id) between 8 and 128),
  outcome text not null check (outcome in ('success','denied','failure','noop')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  operation_id uuid not null,
  correlation_id uuid not null,
  source_class text not null check (source_class in ('admin','system','worker','route')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint platform_audit_events_safe_metadata check (
    public.p3_12_metadata_is_safe(safe_metadata)
    and octet_length(platform_audit_events.safe_metadata::text) <= 4096
  ),
  constraint platform_audit_events_operation_once unique (event_name, operation_id)
);

create index platform_audit_events_created_idx
  on public.platform_audit_events(created_at desc, id desc);
create index platform_audit_events_actor_idx
  on public.platform_audit_events(actor_id, created_at desc, id desc);

create table public.data_access_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (event_name ~ '^access\.[a-z][a-z0-9_.]{2,72}$'),
  event_version smallint not null default 1 check (event_version = 1),
  actor_id uuid references public.profiles(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  company_id uuid references public.company_profiles(id) on delete set null,
  resource_type text not null check (resource_type in ('report','export','document','recording','transcript','bank_evidence','retention_registry','system_readiness')),
  target_opaque_id text check (target_opaque_id is null or char_length(target_opaque_id) between 8 and 128),
  outcome text not null check (outcome in ('granted','denied','unavailable')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  operation_id uuid not null,
  correlation_id uuid not null,
  source_class text not null check (source_class in ('page','route','worker')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint data_access_events_safe_metadata check (
    public.p3_12_metadata_is_safe(safe_metadata)
    and octet_length(data_access_events.safe_metadata::text) <= 4096
  ),
  constraint data_access_events_operation_once unique (event_name, operation_id)
);

create index data_access_events_scope_idx
  on public.data_access_events(tenant_id, company_id, created_at desc, id desc);
create index data_access_events_actor_idx
  on public.data_access_events(actor_id, created_at desc, id desc);

create function public.p3_12_reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'P3_12_APPEND_ONLY';
end;
$$;

revoke all on function public.p3_12_reject_audit_mutation() from public, anon, authenticated, service_role;

create trigger platform_audit_events_immutable
before update or delete on public.platform_audit_events
for each row execute function public.p3_12_reject_audit_mutation();
create trigger platform_audit_events_no_truncate
before truncate on public.platform_audit_events
for each statement execute function public.p3_12_reject_audit_mutation();
create trigger data_access_events_immutable
before update or delete on public.data_access_events
for each row execute function public.p3_12_reject_audit_mutation();
create trigger data_access_events_no_truncate
before truncate on public.data_access_events
for each statement execute function public.p3_12_reject_audit_mutation();

alter table public.platform_audit_events enable row level security;
alter table public.data_access_events enable row level security;
revoke all on table public.platform_audit_events from public, anon, authenticated, service_role;
revoke all on table public.data_access_events from public, anon, authenticated, service_role;

create table public.report_export_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id text not null check (report_id in ('platform-operations','company-operations')),
  report_version smallint not null check (report_version = 1),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete restrict,
  company_id uuid references public.company_profiles(id) on delete restrict,
  operation_id uuid not null unique,
  correlation_id uuid not null,
  filters jsonb not null default '{}'::jsonb check (public.p3_12_metadata_is_safe(filters)),
  snapshot_at timestamptz not null default statement_timestamp(),
  stable_cursor text,
  max_rows integer not null default 1000 check (max_rows between 1 and 1000),
  max_bytes integer not null default 5242880 check (max_bytes between 1 and 5242880),
  row_count integer not null default 0 check (row_count between 0 and 1000),
  file_size_bytes integer not null default 0 check (file_size_bytes between 0 and 5242880),
  state text not null default 'ready' check (state in ('ready','cancelled','expired','unavailable')),
  delivery_mode text not null default 'bounded_sync' check (delivery_mode = 'bounded_sync'),
  expires_at timestamptz not null default (statement_timestamp() + interval '15 minutes'),
  cancelled_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint report_export_jobs_expiry check (expires_at > snapshot_at and expires_at <= snapshot_at + interval '1 hour'),
  constraint report_export_jobs_scope check (
    (report_id = 'platform-operations' and tenant_id is null and company_id is null)
    or (report_id = 'company-operations' and tenant_id is not null and company_id is not null)
  )
);

create index report_export_jobs_actor_idx
  on public.report_export_jobs(requested_by, created_at desc, id desc);
alter table public.report_export_jobs enable row level security;
revoke all on table public.report_export_jobs from public, anon, authenticated, service_role;

create table public.retention_policy_registry (
  data_class text not null,
  version integer not null check (version > 0),
  owner text not null,
  trigger_event text not null,
  approved_duration interval,
  legal_hold_behavior text not null check (legal_hold_behavior = 'block_destructive_action'),
  retention_action text not null check (retention_action in ('retain','anonymize','delete','decision_blocked')),
  evidence_requirement text not null,
  policy_status text not null check (policy_status in ('decision_blocked','approved')),
  destructive_execution_enabled boolean not null default false,
  runtime_status text not null check (runtime_status in ('dry_run','p3_13_pending','enabled')),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  primary key (data_class, version),
  constraint retention_policy_approval_shape check (
    (policy_status = 'decision_blocked' and approved_duration is null and destructive_execution_enabled = false and approved_by is null and approved_at is null)
    or (policy_status = 'approved' and approved_duration is not null and approved_at is not null
        and (approved_by is not null or data_class = 'report_export'))
  )
);

insert into public.retention_policy_registry(
  data_class, version, owner, trigger_event, approved_duration, legal_hold_behavior,
  retention_action, evidence_requirement, policy_status, destructive_execution_enabled, runtime_status, approved_at
) values
  ('customer_personal_data',1,'privacy-owner','verified_erasure',null,'block_destructive_action','decision_blocked','Approved UAE policy and non-production cleanup drill','decision_blocked',false,'dry_run',null),
  ('security_audit',1,'security-owner','record_created',null,'block_destructive_action','retain','Approved security retention decision','decision_blocked',false,'p3_13_pending',null),
  ('financial_ledger',1,'finance-owner','record_created',null,'block_destructive_action','retain','P3.09 integration and approved statutory policy','decision_blocked',false,'p3_13_pending',null),
  ('report_export',1,'reporting-owner','export_created',interval '1 hour','block_destructive_action','delete','Bounded technical artifact expiry from the P3.12 specification','approved',true,'enabled',statement_timestamp());

alter table public.retention_policy_registry enable row level security;
revoke all on table public.retention_policy_registry from public, anon, authenticated, service_role;

create table public.erasure_legal_holds (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.erasure_requests(id) on delete restrict,
  active boolean not null default true,
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  placed_by uuid not null references public.profiles(id) on delete restrict,
  released_by uuid references public.profiles(id) on delete restrict,
  placed_at timestamptz not null default statement_timestamp(),
  released_at timestamptz,
  constraint erasure_legal_holds_shape check (
    (active and released_by is null and released_at is null)
    or (not active and released_by is not null and released_at is not null)
  )
);
create unique index erasure_legal_holds_one_active
  on public.erasure_legal_holds(request_id) where active;
alter table public.erasure_legal_holds enable row level security;
revoke all on table public.erasure_legal_holds from public, anon, authenticated, service_role;

alter table public.erasure_requests
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists decision_operation_id uuid,
  add column if not exists verification_expires_at timestamptz;

update public.erasure_requests
set verification_expires_at = verification_sent_at + interval '24 hours'
where verification_sent_at is not null and verification_expires_at is null;

create unique index erasure_requests_decision_operation_idx
  on public.erasure_requests(decision_operation_id)
  where decision_operation_id is not null;

create function public.append_platform_audit_event(
  p_event_name text, p_actor_id uuid, p_tenant_id uuid, p_action text,
  p_target_type text, p_target_opaque_id text, p_outcome text, p_reason_code text,
  p_operation_id uuid, p_correlation_id uuid, p_source_class text, p_safe_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.platform_audit_events(
    event_name,actor_id,tenant_id,action,target_type,target_opaque_id,outcome,reason_code,
    operation_id,correlation_id,source_class,safe_metadata
  ) values (
    p_event_name,p_actor_id,p_tenant_id,p_action,p_target_type,p_target_opaque_id,p_outcome,p_reason_code,
    p_operation_id,p_correlation_id,p_source_class,coalesce(p_safe_metadata,'{}'::jsonb)
  ) on conflict(event_name,operation_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.platform_audit_events where event_name=p_event_name and operation_id=p_operation_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.append_platform_audit_event(text,uuid,uuid,text,text,text,text,text,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_platform_audit_event(text,uuid,uuid,text,text,text,text,text,uuid,uuid,text,jsonb) to service_role;

create function public.append_data_access_event(
  p_event_name text, p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_resource_type text, p_target_opaque_id text, p_outcome text, p_reason_code text,
  p_operation_id uuid, p_correlation_id uuid, p_source_class text, p_safe_metadata jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.data_access_events(
    event_name,actor_id,tenant_id,company_id,resource_type,target_opaque_id,outcome,reason_code,
    operation_id,correlation_id,source_class,safe_metadata
  ) values (
    p_event_name,p_actor_id,p_tenant_id,p_company_id,p_resource_type,p_target_opaque_id,p_outcome,p_reason_code,
    p_operation_id,p_correlation_id,p_source_class,coalesce(p_safe_metadata,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.append_data_access_event(text,uuid,uuid,uuid,text,text,text,text,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_data_access_event(text,uuid,uuid,uuid,text,text,text,text,uuid,uuid,text,jsonb) to service_role;

create function public.read_p3_12_operational_report(
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
      v_allowed := exists(select 1 from public.pro_company_assignments a where a.pro_profile_id=p_actor_id and a.company_id=p_company_id and a.status::text='active');
    elsif v_actor.role::text = 'customer' then
      v_allowed := v_actor.tenant_id=v_tenant_id and exists(select 1 from public.customer_profiles c where c.profile_id=p_actor_id and c.linked_company_id=p_company_id);
    end if;
  end if;
  if not v_allowed then raise exception using errcode='42501', message='REPORT_ACCESS_DENIED'; end if;

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
      'scheduledMeetings',(select count(*) from public.meetings m where m.status::text='scheduled' and (p_scope='platform' or m.company_id=p_company_id))
    ),
    'sourceFreshness',jsonb_build_object('local',statement_timestamp()),
    'unavailableSources',jsonb_build_array('P3_05_NOT_INTEGRATED','P3_06_NOT_INTEGRATED','P3_09_NOT_INTEGRATED','P3_10_RUNTIME_PENDING')
  ) into v_result;

  insert into public.data_access_events(event_name,actor_id,tenant_id,company_id,resource_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('access.report.read',p_actor_id,v_tenant_id,p_company_id,'report',encode(digest(p_scope || ':' || coalesce(p_company_id::text,'platform'),'sha256'),'hex'),'granted','REPORT_AUTHORIZED',p_operation_id,p_correlation_id,'page',jsonb_build_object('report_id',p_scope || '-operations','version',1));
  return v_result;
end;
$$;
revoke all on function public.read_p3_12_operational_report(uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_p3_12_operational_report(uuid,text,uuid,uuid,uuid) to service_role;

create function public.create_p3_12_report_export(
  p_actor_id uuid,p_report_id text,p_company_id uuid,p_filters jsonb,p_row_count integer,
  p_file_size_bytes integer,p_operation_id uuid,p_correlation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor public.profiles%rowtype; v_tenant_id uuid; v_job public.report_export_jobs%rowtype;
begin
  select * into v_actor from public.profiles where id=p_actor_id and status::text='active';
  if not found or v_actor.role::text not in ('admin','super_admin') or v_actor.tenant_id is not null then
    raise exception using errcode='42501',message='REPORT_EXPORT_DENIED';
  end if;
  if p_report_id <> 'platform-operations' or p_company_id is not null then
    raise exception using errcode='22023',message='REPORT_EXPORT_SCOPE_INVALID';
  end if;
  if p_row_count < 0 or p_row_count > 1000 or p_file_size_bytes < 0 or p_file_size_bytes > 5242880 then
    raise exception using errcode='22023',message='REPORT_EXPORT_LIMIT';
  end if;
  insert into public.report_export_jobs(report_id,report_version,requested_by,tenant_id,company_id,filters,snapshot_at,row_count,file_size_bytes,expires_at,operation_id,correlation_id,state)
  values(p_report_id,1,p_actor_id,null,null,coalesce(p_filters,'{}'::jsonb),statement_timestamp(),p_row_count,p_file_size_bytes,statement_timestamp()+interval '15 minutes',p_operation_id,p_correlation_id,'ready')
  returning * into v_job;
  insert into public.data_access_events(event_name,actor_id,tenant_id,company_id,resource_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('access.report.export',p_actor_id,null,null,'export',encode(digest(v_job.id::text,'sha256'),'hex'),'granted','REPORT_EXPORT_AUTHORIZED',p_operation_id,p_correlation_id,'route',jsonb_build_object('report_id',p_report_id,'version',1,'rows',p_row_count));
  return jsonb_build_object('id',v_job.id,'snapshotAt',v_job.snapshot_at,'expiresAt',v_job.expires_at);
end;
$$;
revoke all on function public.create_p3_12_report_export(uuid,text,uuid,jsonb,integer,integer,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_p3_12_report_export(uuid,text,uuid,jsonb,integer,integer,uuid,uuid) to service_role;

create function public.read_p3_12_retention_registry(p_actor_id uuid,p_operation_id uuid,p_correlation_id uuid)
returns setof public.retention_policy_registry
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and status::text='active' and role::text in ('admin','super_admin') and tenant_id is null) then
    raise exception using errcode='42501',message='PLATFORM_OPERATOR_REQUIRED';
  end if;
  insert into public.data_access_events(event_name,actor_id,resource_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('access.retention_registry.read',p_actor_id,'retention_registry','registry-v1','granted','RETENTION_READ_AUTHORIZED',p_operation_id,p_correlation_id,'page','{}'::jsonb);
  return query select * from public.retention_policy_registry order by data_class,version desc;
end;
$$;
revoke all on function public.read_p3_12_retention_registry(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_p3_12_retention_registry(uuid,uuid,uuid) to service_role;

create function public.read_p3_12_readiness(p_actor_id uuid,p_operation_id uuid,p_correlation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_pending bigint; v_oldest timestamptz;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and status::text='active' and role::text in ('admin','super_admin') and tenant_id is null) then
    raise exception using errcode='42501',message='PLATFORM_OPERATOR_REQUIRED';
  end if;
  select count(*),min(available_at) into v_pending,v_oldest from public.event_jobs where state in ('pending','retryable','replayed');
  insert into public.data_access_events(event_name,actor_id,resource_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('access.system_readiness.read',p_actor_id,'system_readiness','readiness-v1','granted','READINESS_AUTHORIZED',p_operation_id,p_correlation_id,'page','{}'::jsonb);
  return jsonb_build_object('generatedAt',statement_timestamp(),'components',jsonb_build_array(
    jsonb_build_object('id','database','state','available','freshAt',statement_timestamp()),
    jsonb_build_object('id','eventQueue','state',case when v_pending>1000 then 'degraded' else 'available' end,'pending',v_pending,'oldestAvailableAt',v_oldest),
    jsonb_build_object('id','distributedRuntime','state','unavailable','reason','P3_13_RUNTIME_PROOF_PENDING')
  ));
end;
$$;
revoke all on function public.read_p3_12_readiness(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.read_p3_12_readiness(uuid,uuid,uuid) to service_role;

create function public.verify_erasure_request(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.erasure_requests%rowtype;
begin
  select * into v_request from public.erasure_requests
  where verification_token_hash = p_token_hash
    and status = 'pending_verification'
    and verification_expires_at > statement_timestamp()
  for update;
  if not found then raise exception using errcode='P0001', message='ERASURE_VERIFICATION_INVALID'; end if;
  update public.erasure_requests
  set status = 'submitted',
      verified_at = statement_timestamp(),
      verification_token_hash = null,
      version = version + 1
  where id = v_request.id;
  insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
  values(v_request.subject_tenant_id,v_request.subject_user_id,'erasure_verified','self_serve',jsonb_build_object('request_id',v_request.id));
  return v_request.id;
end;
$$;
revoke all on function public.verify_erasure_request(text) from public, anon, authenticated;
grant execute on function public.verify_erasure_request(text) to service_role;

create function public.approve_erasure_request(p_request_id uuid,p_actor_id uuid,p_expected_version integer,p_operation_id uuid,p_correlation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.erasure_requests%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and status::text='active' and role::text in ('admin','super_admin') and tenant_id is null) then
    raise exception using errcode='42501',message='PLATFORM_OPERATOR_REQUIRED';
  end if;
  select * into v_request from public.erasure_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='ERASURE_NOT_FOUND'; end if;
  if v_request.decision_operation_id=p_operation_id and v_request.status='approved' then return jsonb_build_object('version',v_request.version,'replayed',true); end if;
  if v_request.status not in ('submitted','under_review') or v_request.version<>p_expected_version then raise exception using errcode='40001',message='ERASURE_STALE'; end if;
  update public.erasure_requests set status='approved',reviewed_by=p_actor_id,reviewed_at=statement_timestamp(),decision_operation_id=p_operation_id,version=version+1 where id=p_request_id;
  insert into public.platform_audit_events(event_name,actor_id,tenant_id,action,target_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('privacy.erasure.approved',p_actor_id,v_request.subject_tenant_id,'approve_erasure','erasure_request',encode(digest(p_request_id::text,'sha256'),'hex'),'success','ERASURE_APPROVED_DRY_RUN',p_operation_id,p_correlation_id,'admin',jsonb_build_object('policy_execution','disabled'));
  return jsonb_build_object('version',v_request.version+1,'replayed',false);
end;
$$;
revoke all on function public.approve_erasure_request(uuid,uuid,integer,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_erasure_request(uuid,uuid,integer,uuid,uuid) to service_role;

create function public.reject_erasure_request(p_request_id uuid,p_actor_id uuid,p_expected_version integer,p_operation_id uuid,p_correlation_id uuid,p_reason_code text,p_reason_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.erasure_requests%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and status::text='active' and role::text in ('admin','super_admin') and tenant_id is null) then
    raise exception using errcode='42501',message='PLATFORM_OPERATOR_REQUIRED';
  end if;
  select * into v_request from public.erasure_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='ERASURE_NOT_FOUND'; end if;
  if v_request.decision_operation_id=p_operation_id and v_request.status='rejected' then return jsonb_build_object('version',v_request.version,'replayed',true); end if;
  if v_request.status not in ('submitted','under_review') or v_request.version<>p_expected_version then raise exception using errcode='40001',message='ERASURE_STALE'; end if;
  update public.erasure_requests set status='rejected',reviewed_by=p_actor_id,reviewed_at=statement_timestamp(),rejection_reason=left(p_reason_note,1000),decision_operation_id=p_operation_id,version=version+1 where id=p_request_id;
  insert into public.platform_audit_events(event_name,actor_id,tenant_id,action,target_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('privacy.erasure.rejected',p_actor_id,v_request.subject_tenant_id,'reject_erasure','erasure_request',encode(digest(p_request_id::text,'sha256'),'hex'),'success',p_reason_code,p_operation_id,p_correlation_id,'admin','{}'::jsonb);
  return jsonb_build_object('version',v_request.version+1,'replayed',false);
end;
$$;
revoke all on function public.reject_erasure_request(uuid,uuid,integer,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.reject_erasure_request(uuid,uuid,integer,uuid,uuid,text,text) to service_role;

create function public.assert_erasure_cleanup_allowed(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists(select 1 from public.erasure_legal_holds where request_id=p_request_id and active) then
    raise exception using errcode='P0001',message='ERASURE_LEGAL_HOLD';
  end if;
  if not exists(select 1 from public.retention_policy_registry where data_class='customer_personal_data' and policy_status='approved' and destructive_execution_enabled and runtime_status='enabled') then
    raise exception using errcode='P0001',message='ERASURE_POLICY_EXECUTION_DISABLED';
  end if;
end;
$$;
revoke all on function public.assert_erasure_cleanup_allowed(uuid) from public, anon, authenticated;
grant execute on function public.assert_erasure_cleanup_allowed(uuid) to service_role;

create function public.unlock_account_with_platform_audit(p_actor_id uuid,p_key text,p_operation_id uuid,p_correlation_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and status::text='active' and role::text in ('admin','super_admin') and tenant_id is null) then
    raise exception using errcode='42501',message='PLATFORM_OPERATOR_REQUIRED';
  end if;
  select (safe_metadata->>'rows')::integer into v_count
  from public.platform_audit_events
  where operation_id=p_operation_id and event_name='security.account.unlocked';
  if found then return v_count; end if;
  update public.auth_failed_attempts set count=0,locked_until=null,updated_at=statement_timestamp() where key=p_key;
  get diagnostics v_count = row_count;
  insert into public.platform_audit_events(event_name,actor_id,tenant_id,action,target_type,target_opaque_id,outcome,reason_code,operation_id,correlation_id,source_class,safe_metadata)
  values('security.account.unlocked',p_actor_id,null,'unlock_account','lockout_key',encode(digest(p_key,'sha256'),'hex'),case when v_count>0 then 'success' else 'noop' end,case when v_count>0 then 'ACCOUNT_UNLOCKED' else 'LOCKOUT_NOT_FOUND' end,p_operation_id,p_correlation_id,'admin',jsonb_build_object('rows',v_count));
  return v_count;
end;
$$;
revoke all on function public.unlock_account_with_platform_audit(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.unlock_account_with_platform_audit(uuid,text,uuid,uuid) to service_role;

commit;
