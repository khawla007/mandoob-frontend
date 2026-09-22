-- P3.03 domain emitters over the frozen P3.10 v1.0.0 interface.
-- Channel/provider delivery remains disabled and outside this migration.
begin;

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('company.onboarding.section_saved', 1, '{"resource_id":"uuid","operation_id":"uuid","section":"state","version":"integer","change":"state"}'),
  ('company.onboarding.submitted', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
  ('company.onboarding.activated', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
  ('company.settings.updated', 1, '{"resource_id":"uuid","operation_id":"uuid","section":"state","version":"integer"}'),
  ('pro.credential.submitted', 1, '{"subject_id":"uuid","resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}'),
  ('pro.credential.decided', 1, '{"subject_id":"uuid","resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","decision":"state"}'),
  ('pro.credential.evidence_changed', 1, '{"subject_id":"uuid","resource_id":"uuid","evidence_id":"uuid","operation_id":"uuid","version":"integer","change":"state"}'),
  ('pro.commercial_terms.changed', 1, '{"subject_id":"uuid","resource_id":"uuid","operation_id":"uuid","term_kind":"state","version":"integer","change":"state"}');

insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled
)
select 'internal.lifecycle.projection', event_type, event_version, 5, 120, true
from public.event_contract_registrations
where event_type in (
  'company.onboarding.section_saved',
  'company.onboarding.submitted',
  'company.onboarding.activated',
  'company.settings.updated',
  'pro.credential.submitted',
  'pro.credential.decided',
  'pro.credential.evidence_changed',
  'pro.commercial_terms.changed'
);

create function private.p303_event_uuid(p_seed text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_seed, 'UTF8')), 'hex');
begin
  return (
    pg_catalog.substr(v_hash, 1, 8) || '-' ||
    pg_catalog.substr(v_hash, 9, 4) || '-4' ||
    pg_catalog.substr(v_hash, 14, 3) || '-a' ||
    pg_catalog.substr(v_hash, 18, 3) || '-' ||
    pg_catalog.substr(v_hash, 21, 12)
  )::uuid;
end;
$$;

create function private.publish_p303_event(
  p_source text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_tenant_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_correlation_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed text := p_event_type || ':1:' || p_source;
begin
  perform public.publish_domain_event(
    private.p303_event_uuid(v_seed),
    p_event_type,
    1::smallint,
    p_occurred_at,
    p_tenant_id,
    p_company_id,
    p_actor_id,
    p_correlation_id,
    null::uuid,
    'internal'::text,
    p_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_seed, 'UTF8')), 'hex')
  );
end;
$$;

-- Every credential-decision and commercial-term mutation passes through this
-- replay gate before writing its immutable audit row. Retain the request's
-- operation identity only for this transaction so the row trigger can publish
-- the same causal identity atomically. Exact replays return before another
-- source row is written and therefore do not republish.
create or replace function public.pro_lifecycle_replay_result(
  p_entity_kind public.pro_lifecycle_operation_kind,
  p_entity_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.pro_lifecycle_operation_receipts%rowtype;
begin
  if p_operation_id is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_OPERATION';
  end if;
  perform pg_catalog.set_config('app.p303_operation_id', p_operation_id::text, true);
  select * into v_receipt
  from public.pro_lifecycle_operation_receipts
  where entity_id = p_entity_id and operation_id = p_operation_id
  for update;
  if not found then return null; end if;
  if v_receipt.entity_kind <> p_entity_kind or v_receipt.payload_hash <> p_payload_hash then
    raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
  end if;
  return v_receipt.sanitized_result;
end;
$$;

create function private.p303_current_operation_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value text := pg_catalog.current_setting('app.p303_operation_id', true);
begin
  return case when v_value is null or v_value = '' then null else v_value::uuid end;
end;
$$;

create function private.emit_company_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_payload jsonb;
  v_company_id uuid;
  v_operation_id uuid;
  v_change text;
begin
  if new.action in (
    'company_onboarding_section_saved',
    'company_onboarding_section_completed',
    'company_onboarding_section_reopened'
  ) then
    v_type := 'company.onboarding.section_saved';
    v_change := case new.action
      when 'company_onboarding_section_completed' then 'completed'
      when 'company_onboarding_section_reopened' then 'reopened'
      else 'saved'
    end;
    v_payload := pg_catalog.jsonb_build_object(
      'resource_id', new.details->>'company_id',
      'operation_id', new.details->>'operation_id',
      'section', new.details->>'section',
      'version', (new.details->>'version')::bigint,
      'change', v_change
    );
  elsif new.action = 'company_onboarding_submitted' then
    v_type := 'company.onboarding.submitted';
    v_payload := pg_catalog.jsonb_build_object(
      'resource_id', new.details->>'company_id',
      'operation_id', new.details->>'operation_id',
      'version', (new.details->>'version')::bigint,
      'state', 'ready_for_activation'
    );
  elsif new.action = 'company_activated' then
    v_type := 'company.onboarding.activated';
    v_payload := pg_catalog.jsonb_build_object(
      'resource_id', new.details->>'company_id',
      'operation_id', new.details->>'operation_id',
      'version', (new.details->>'version')::bigint,
      'state', 'active'
    );
  elsif new.action = 'updated' and new.details->>'entity' = 'company_settings' then
    v_type := 'company.settings.updated';
    v_payload := pg_catalog.jsonb_build_object(
      'resource_id', new.details->>'company_id',
      'operation_id', new.details->>'operation_id',
      'section', new.details->>'section',
      'version', (new.details->>'version')::bigint
    );
  else
    return new;
  end if;
  v_company_id := (new.details->>'company_id')::uuid;
  v_operation_id := (new.details->>'operation_id')::uuid;
  perform private.publish_p303_event(
    'tenant:' || new.tenant_id::text ||
      ':company:' || v_company_id::text ||
      ':resource:' || v_company_id::text ||
      ':operation:' || v_operation_id::text ||
      ':version:' || (v_payload->>'version'),
    v_type,
    new.created_at,
    new.tenant_id,
    v_company_id,
    new.actor_id,
    coalesce(v_operation_id, private.p303_event_uuid('tenant_audit_log:' || new.id::text)),
    v_payload
  );
  return new;
end;
$$;

create trigger emit_company_lifecycle_event
after insert on public.tenant_audit_log
for each row execute function private.emit_company_lifecycle_event();

create function private.emit_pro_decision_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := case when new.event = 'submitted' then 'pro.credential.submitted' else 'pro.credential.decided' end;
  v_payload jsonb;
  v_operation_id uuid := private.p303_current_operation_id();
begin
  -- Historical/direct fixture rows have no owning request. Public workflow DML
  -- is revoked, so only rows carrying the transaction-local operation emit.
  if v_operation_id is null then return new; end if;
  if new.event = 'submitted' then
    v_payload := pg_catalog.jsonb_build_object(
      'subject_id', new.pro_profile_id,
      'resource_id', new.credential_id,
      'operation_id', v_operation_id,
      'version', new.credential_version,
      'state', new.to_state
    );
  else
    v_payload := pg_catalog.jsonb_build_object(
      'subject_id', new.pro_profile_id,
      'resource_id', new.credential_id,
      'operation_id', v_operation_id,
      'version', new.credential_version,
      'state', new.to_state,
      'decision', new.event
    );
  end if;
  perform private.publish_p303_event(
    'subject:' || new.pro_profile_id::text ||
      ':resource:' || new.credential_id::text ||
      ':operation:' || v_operation_id::text ||
      ':version:' || new.credential_version::text,
    v_type,
    new.created_at,
    null,
    null,
    new.actor_profile_id,
    v_operation_id,
    v_payload
  );
  return new;
end;
$$;

create trigger emit_pro_decision_event
after insert on public.pro_credential_decisions
for each row execute function private.emit_pro_decision_event();

create function private.emit_pro_evidence_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.pro_credential_evidence%rowtype := coalesce(new, old);
  v_version bigint;
  v_change text := case when tg_op = 'INSERT' then 'added' else 'removed' end;
  v_operation_id uuid;
  v_actor_id uuid;
begin
  if tg_op = 'INSERT' then
    select reservation.operation_id, reservation.actor_id
      into v_operation_id, v_actor_id
    from public.pro_credential_evidence_upload_reservations reservation
    where reservation.evidence_id = v_row.id
      and reservation.credential_id = v_row.credential_id
      and reservation.pro_profile_id = v_row.pro_profile_id;
  else
    select coalesce(removal.recovery_operation_id, removal.operation_id),
           coalesce(removal.recovery_actor_id, removal.actor_id)
      into v_operation_id, v_actor_id
    from public.pro_credential_evidence_removals removal
    where removal.evidence_id = v_row.id
      and removal.credential_id = v_row.credential_id
      and removal.pro_profile_id = v_row.pro_profile_id;
  end if;
  if v_operation_id is null then return v_row; end if;
  select version + 1 into v_version
  from public.pro_credentials
  where id = v_row.credential_id;
  perform private.publish_p303_event(
    'subject:' || v_row.pro_profile_id::text ||
      ':resource:' || v_row.credential_id::text ||
      ':evidence:' || v_row.id::text ||
      ':operation:' || v_operation_id::text ||
      ':version:' || v_version::text,
    'pro.credential.evidence_changed',
    case when tg_op = 'INSERT' then v_row.created_at else pg_catalog.now() end,
    null,
    null,
    v_actor_id,
    v_operation_id,
    pg_catalog.jsonb_build_object(
      'subject_id', v_row.pro_profile_id,
      'resource_id', v_row.credential_id,
      'evidence_id', v_row.id,
      'operation_id', v_operation_id,
      'version', v_version,
      'change', v_change
    )
  );
  return v_row;
end;
$$;

create trigger emit_pro_evidence_event
after insert or delete on public.pro_credential_evidence
for each row execute function private.emit_pro_evidence_event();

create function private.emit_pro_commercial_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_operation_id uuid := private.p303_current_operation_id();
begin
  if v_operation_id is null then return new; end if;
  select term_kind::text into v_kind
  from public.pro_commercial_terms
  where id = new.commercial_term_id;
  perform private.publish_p303_event(
    'subject:' || new.pro_profile_id::text ||
      ':resource:' || new.commercial_term_id::text ||
      ':operation:' || v_operation_id::text ||
      ':version:' || new.term_version::text,
    'pro.commercial_terms.changed',
    new.created_at,
    null,
    null,
    new.actor_profile_id,
    v_operation_id,
    pg_catalog.jsonb_build_object(
      'subject_id', new.pro_profile_id,
      'resource_id', new.commercial_term_id,
      'operation_id', v_operation_id,
      'term_kind', v_kind,
      'version', new.term_version,
      'change', new.event
    )
  );
  return new;
end;
$$;

create trigger emit_pro_commercial_event
after insert on public.pro_commercial_term_events
for each row execute function private.emit_pro_commercial_event();

revoke all on function private.p303_event_uuid(text) from public, anon, authenticated, service_role;
revoke all on function private.p303_current_operation_id() from public, anon, authenticated, service_role;
revoke all on function private.publish_p303_event(text, text, timestamptz, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.emit_company_lifecycle_event() from public, anon, authenticated, service_role;
revoke all on function private.emit_pro_decision_event() from public, anon, authenticated, service_role;
revoke all on function private.emit_pro_evidence_event() from public, anon, authenticated, service_role;
revoke all on function private.emit_pro_commercial_event() from public, anon, authenticated, service_role;

commit;
