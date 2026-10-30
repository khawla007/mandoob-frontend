\set ON_ERROR_STOP on
begin;
set local statement_timeout = '20s';
set local lock_timeout = '5s';

insert into public.tenants(id,name,slug,status)
values
 ('95000000-0000-4000-8000-000000000001','Event fixture','p303-event-fixture','active'),
 ('95000000-0000-4000-8000-000000000002','Event fixture two','p303-event-fixture-two','active');
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('95000000-0000-4000-8000-000000000011','authenticated','authenticated','event-admin@example.test','','{}','{}',now(),now()),
 ('95000000-0000-4000-8000-000000000012','authenticated','authenticated','event-pro@example.test','','{}','{}',now(),now());
insert into public.profiles(id,tenant_id,role,status,full_name)
values
 ('95000000-0000-4000-8000-000000000011',null,'super_admin','active','Event Admin'),
 ('95000000-0000-4000-8000-000000000012',null,'pro','active','Event PRO');
insert into public.pro_profiles(profile_id)
values('95000000-0000-4000-8000-000000000012');
insert into public.company_profiles(id,tenant_id,company_name,status)
values
 ('95000000-0000-4000-8000-000000000021','95000000-0000-4000-8000-000000000001','Event company','onboarding'),
 ('95000000-0000-4000-8000-000000000022','95000000-0000-4000-8000-000000000002','Event company two','onboarding');

do $$
declare role_name text; signature text;
begin
  if (select count(*) from public.event_contract_registrations where event_type like 'company.%' or event_type like 'pro.%') <> 8 then
    raise exception 'P303_EVENT_REGISTRATION_COUNT_INCORRECT';
  end if;
  if (select count(*) from public.event_consumer_registrations where consumer_name='internal.lifecycle.projection' and enabled) <> 8 then
    raise exception 'P303_EVENT_CONSUMER_COUNT_INCORRECT';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,'public.domain_events','select')
      or has_table_privilege(role_name,'public.event_jobs','insert') then
      raise exception 'P303_EVENT_DIRECT_TABLE_GRANT_PRESENT';
    end if;
    foreach signature in array array[
      'private.p303_event_uuid(text)',
      'private.publish_p303_event(text,text,timestamp with time zone,uuid,uuid,uuid,uuid,jsonb)',
      'private.emit_company_lifecycle_event()',
      'private.emit_pro_decision_event()',
      'private.emit_pro_evidence_event()',
      'private.emit_pro_commercial_event()'
    ] loop
      if has_function_privilege(role_name,signature,'execute') then
        raise exception 'P303_EVENT_PRIVATE_EXECUTE_GRANT_PRESENT';
      end if;
    end loop;
  end loop;
end;
$$;

insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
values
 ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000012','updated','self_serve','{"entity":"company_settings","company_id":"95000000-0000-4000-8000-000000000021","section":"branding","version":1,"operation_id":"95000000-0000-4000-8000-000000000101"}'),
 ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000012','company_onboarding_section_saved','self_serve','{"company_id":"95000000-0000-4000-8000-000000000021","section":"legal","version":2,"operation_id":"95000000-0000-4000-8000-000000000102"}'),
 ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000012','company_onboarding_submitted','self_serve','{"company_id":"95000000-0000-4000-8000-000000000021","version":3,"operation_id":"95000000-0000-4000-8000-000000000103"}'),
 ('95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000011','company_activated','admin','{"company_id":"95000000-0000-4000-8000-000000000021","version":4,"operation_id":"95000000-0000-4000-8000-000000000104"}');

-- The source workflow scopes operation ids by tenant/company. The same UUID is
-- therefore valid for another owner and must not collide in the global outbox.
insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
values(
 '95000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000012',
 'updated','self_serve',
 '{"entity":"company_settings","company_id":"95000000-0000-4000-8000-000000000022","section":"branding","version":1,"operation_id":"95000000-0000-4000-8000-000000000101"}'
);

insert into public.pro_credentials(
 id,pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,
 issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by
) values(
 '95000000-0000-4000-8000-000000000031','95000000-0000-4000-8000-000000000012',
 'synthetic',repeat('9',64),'9999','Synthetic Authority',current_date-1,current_date+365,
 'draft',0,null,'95000000-0000-4000-8000-000000000012'
);
select pg_catalog.set_config('app.p303_operation_id','95000000-0000-4000-8000-000000000141',true);
insert into public.pro_credential_decisions(
 id,pro_profile_id,credential_id,event,from_state,to_state,actor_profile_id,credential_version
) values(
 '95000000-0000-4000-8000-000000000041','95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000031','submitted','draft','submitted','95000000-0000-4000-8000-000000000012',1
);
select pg_catalog.set_config('app.p303_operation_id','95000000-0000-4000-8000-000000000142',true);
insert into public.pro_credential_decisions(
 id,pro_profile_id,credential_id,event,from_state,to_state,actor_profile_id,credential_version
) values(
 '95000000-0000-4000-8000-000000000042','95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000031','verified','under_review','verified','95000000-0000-4000-8000-000000000011',2
);

insert into public.pro_credential_evidence(
 id,pro_profile_id,credential_id,storage_path,mime_type,size_bytes,sha256,
 original_name_safe,scan_provider,scan_completed_at,uploaded_by
) values(
 '95000000-0000-4000-8000-000000000051','95000000-0000-4000-8000-000000000012',
 '95000000-0000-4000-8000-000000000031',
 'pro-credentials/95000000-0000-4000-8000-000000000012/95000000-0000-4000-8000-000000000031/95000000-0000-4000-8000-000000000051',
 'application/pdf',9,repeat('a',64),'license.pdf','clamav',now(),
 '95000000-0000-4000-8000-000000000012'
);
select public.prepare_pro_credential_evidence_removal(
 '95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000031',
 '95000000-0000-4000-8000-000000000051',0,'95000000-0000-4000-8000-000000000052',repeat('b',64)
);
select public.finalize_pro_credential_evidence_removal(
 '95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000031',
 '95000000-0000-4000-8000-000000000051',0,'95000000-0000-4000-8000-000000000052',repeat('b',64)
);

insert into public.pro_commercial_terms(
 id,pro_profile_id,term_kind,model,currency,amount_minor,retainer_interval,scope,
 effective_from,status,version,created_by
) values(
 '95000000-0000-4000-8000-000000000061','95000000-0000-4000-8000-000000000012',
 'pricing','per_registration','AED',10000,null,'all_registrations',current_date,'active',1,
 '95000000-0000-4000-8000-000000000011'
);
select pg_catalog.set_config('app.p303_operation_id','95000000-0000-4000-8000-000000000162',true);
insert into public.pro_commercial_term_events(
 id,pro_profile_id,commercial_term_id,event,from_status,to_status,actor_profile_id,term_version
) values(
 '95000000-0000-4000-8000-000000000062','95000000-0000-4000-8000-000000000012',
 '95000000-0000-4000-8000-000000000061','activated','draft','active',
 '95000000-0000-4000-8000-000000000011',1
);

do $$
declare
  v_before bigint;
  v_event public.domain_events%rowtype;
begin
  if (select count(*) from public.domain_events) <> 9
    or (select count(*) from public.event_jobs) <> 9
    or (select count(distinct event_type) from public.domain_events) <> 8 then
    raise exception 'P303_EVENT_OR_JOB_COUNT_INCORRECT';
  end if;
  if exists(
    select 1 from public.domain_events
    where event_type like 'company.%' and (tenant_id is null or company_id is null)
  ) or exists(
    select 1 from public.domain_events
    where event_type like 'pro.%' and (tenant_id is not null or company_id is not null)
  ) then
    raise exception 'P303_EVENT_SCOPE_INCORRECT';
  end if;
  if exists(
    select 1 from public.domain_events
    where payload ->> 'operation_id' is null
       or correlation_id is distinct from (payload ->> 'operation_id')::uuid
  ) then
    raise exception 'P303_EVENT_CAUSAL_OPERATION_INCORRECT';
  end if;
  if (
    select count(*) from public.domain_events
    where event_type='company.settings.updated'
      and payload ->> 'operation_id'='95000000-0000-4000-8000-000000000101'
  ) <> 2 then
    raise exception 'P303_CROSS_OWNER_OPERATION_COLLISION';
  end if;
  if exists(
    select 1 from public.domain_events
    where payload::text ~* 'email|phone|token|storage_path|synthetic|license[.]pdf'
  ) then
    raise exception 'P303_EVENT_PAYLOAD_LEAK';
  end if;

  select * into strict v_event from public.domain_events
  where event_type='company.settings.updated'
    and tenant_id='95000000-0000-4000-8000-000000000001';
  perform public.publish_domain_event(
    v_event.id,v_event.event_type,v_event.event_version,v_event.occurred_at,
    v_event.tenant_id,v_event.company_id,v_event.actor_id,v_event.correlation_id,
    v_event.causation_id,v_event.privacy_class,v_event.payload,v_event.dedupe_key
  );
  if (select count(*) from public.event_jobs where event_id=v_event.id) <> 1 then
    raise exception 'P303_EVENT_EXACT_REPLAY_DUPLICATED_JOB';
  end if;

  begin
    perform public.publish_domain_event(
      v_event.id,v_event.event_type,v_event.event_version,v_event.occurred_at,
      v_event.tenant_id,v_event.company_id,v_event.actor_id,v_event.correlation_id,
      v_event.causation_id,v_event.privacy_class,
      v_event.payload || '{"version":999}'::jsonb,v_event.dedupe_key
    );
    raise exception 'P303_EVENT_CHANGED_REPLAY_ACCEPTED';
  exception when unique_violation then
    if sqlerrm <> 'EVENT_DEDUPE_CONFLICT' then raise; end if;
  end;

  select count(*) into v_before from public.domain_events;
  begin
    insert into public.tenant_audit_log(tenant_id,actor_id,action,source,details)
    values(
      '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000012',
      'updated','self_serve',
      '{"entity":"company_settings","company_id":"95000000-0000-4000-8000-000000000021","section":"contact","version":1,"operation_id":"95000000-0000-4000-8000-000000000199"}'
    );
    raise exception 'SIMULATED_DOMAIN_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'SIMULATED_DOMAIN_ROLLBACK' then raise; end if;
  end;
  if (select count(*) from public.domain_events) <> v_before then
    raise exception 'P303_EVENT_SURVIVED_DOMAIN_ROLLBACK';
  end if;
end;
$$;

rollback;
