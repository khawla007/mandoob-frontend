-- Atomic PRO credential, evidence, commercial-term, eligibility, and history workflows.
begin;

alter type public.auth_event_kind add value if not exists 'pro_lifecycle_changed';

create or replace function public.authorize_pro_lifecycle_actor(
  p_actor_id uuid,
  p_target_pro_profile_id uuid,
  p_operator_only boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if p_actor_id is null or p_target_pro_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  select * into v_actor from public.profiles where id = p_actor_id;
  select * into v_target from public.profiles where id = p_target_pro_profile_id;

  if v_target.id is null or v_target.role <> 'pro' or v_target.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_actor.id is null or v_actor.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_actor.role in ('admin', 'super_admin') and v_actor.tenant_id is null then
    return 'operator';
  end if;
  if not p_operator_only and v_actor.role = 'pro' and v_actor.id = v_target.id then
    return 'self';
  end if;
  raise exception using errcode = 'P0001', message = 'FORBIDDEN';
end;
$$;

create or replace function public.assert_pro_lifecycle_actor(
  p_actor_id uuid,
  p_target_pro_profile_id uuid,
  p_operator_only boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or p_target_pro_profile_id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  perform 1
  from public.profiles profile
  where profile.id in (p_actor_id, p_target_pro_profile_id)
  order by profile.id
  for update;
  return public.authorize_pro_lifecycle_actor(
    p_actor_id, p_target_pro_profile_id, p_operator_only
  );
end;
$$;

create or replace function public.assert_safe_pro_decision_reason(
  p_reason_code text,
  p_reason text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.btrim(p_reason_code) !~ '^[A-Z][A-Z0-9_]{1,63}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
     or p_reason ~ '[[:cntrl:]]'
     or p_reason ~* '(pro-credentials/|storage_path|identifier_(ciphertext|hash)|sha256|sqlstate)'
     or p_reason ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' then
    raise exception using errcode = 'P0001', message = 'INVALID_DECISION_REASON';
  end if;
end;
$$;

create or replace function public.write_pro_lifecycle_audit(
  p_actor_id uuid,
  p_target_pro_profile_id uuid,
  p_action text,
  p_entity_id uuid,
  p_version bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action !~ '^[a-z][a-z0-9_]{2,63}$' or p_version < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_AUDIT_EVENT';
  end if;
  insert into public.auth_events (
    actor_user_id, tenant_id, kind, details
  ) values (
    p_actor_id,
    null,
    'pro_lifecycle_changed',
    pg_catalog.jsonb_build_object(
      'action', p_action,
      'targetProProfileId', p_target_pro_profile_id,
      'entityId', p_entity_id,
      'version', p_version
    )
  );
end;
$$;

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

create or replace function public.store_pro_lifecycle_receipt(
  p_entity_kind public.pro_lifecycle_operation_kind,
  p_entity_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_sanitized_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.pro_lifecycle_operation_receipts (
    entity_kind, entity_id, operation_id, payload_hash, sanitized_result
  ) values (
    p_entity_kind, p_entity_id, p_operation_id, p_payload_hash, p_sanitized_result
  );
end;
$$;

create or replace function public.pro_credential_masked_result(p_credential_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'credentialId', credential.id,
    'type', credential.credential_type::text,
    'maskedIdentifier', case
      when credential.identifier_last4 is null then null
      else '•••• ' || credential.identifier_last4
    end,
    'issuingAuthority', credential.issuing_authority,
    'issueDate', credential.issue_date,
    'expiryDate', credential.expiry_date,
    'state', credential.state::text,
    'version', credential.version,
    'evidenceCount', (
      select pg_catalog.count(*)
      from public.pro_credential_evidence evidence
      where evidence.credential_id = credential.id
    ),
    'submittedAt', credential.submitted_at,
    'supersedesCredentialId', credential.supersedes_credential_id
  )
  from public.pro_credentials credential
  where credential.id = p_credential_id;
$$;

create or replace function public.create_pro_credential_draft(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_credential_id uuid;
  v_result jsonb;
begin
  perform public.assert_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, false);
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_pro_profile_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  if exists (
    select 1 from public.pro_credentials
    where pro_profile_id = p_pro_profile_id
      and credential_type = 'pro_license'
      and state in ('draft', 'submitted', 'under_review')
    for update
  ) then
    raise exception using errcode = 'P0001', message = 'CREDENTIAL_IN_PROGRESS';
  end if;

  insert into public.pro_credentials (pro_profile_id, created_by)
  values (p_pro_profile_id, p_actor_id)
  returning id into v_credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, p_pro_profile_id, 'credential_draft_created', v_credential_id, 0
  );
  v_result := public.pro_credential_masked_result(v_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_pro_profile_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.save_pro_credential_draft(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_identifier_ciphertext text,
  p_identifier_hash text,
  p_identifier_last4 text,
  p_issuing_authority text,
  p_issue_date date,
  p_expiry_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;

  update public.pro_credentials
  set identifier_ciphertext = p_identifier_ciphertext,
      identifier_hash = p_identifier_hash,
      identifier_last4 = pg_catalog.upper(p_identifier_last4),
      issuing_authority = pg_catalog.btrim(p_issuing_authority),
      issue_date = p_issue_date,
      expiry_date = p_expiry_date,
      legacy_unmasked = false,
      version = version + 1
  where id = p_credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_draft_saved',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.register_pro_credential_evidence(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_evidence_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_original_name_safe text,
  p_scan_provider text,
  p_scan_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;

  insert into public.pro_credential_evidence (
    id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
    original_name_safe, scan_provider, scan_completed_at, uploaded_by
  ) values (
    p_evidence_id, v_credential.pro_profile_id, p_credential_id, p_storage_path,
    p_mime_type, p_size_bytes, p_sha256, pg_catalog.btrim(p_original_name_safe),
    pg_catalog.btrim(p_scan_provider), p_scan_completed_at, p_actor_id
  );
  update public.pro_credentials set version = version + 1 where id = p_credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_evidence_added',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.remove_pro_credential_evidence(
  p_actor_id uuid,
  p_credential_id uuid,
  p_evidence_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  delete from public.pro_credential_evidence
  where id = p_evidence_id and credential_id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  update public.pro_credentials set version = version + 1 where id = p_credential_id;
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_evidence_removed',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.submit_pro_credential(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  if v_credential.identifier_ciphertext is null
     or v_credential.identifier_hash is null
     or v_credential.identifier_last4 is null
     or v_credential.issuing_authority is null
     or v_credential.issue_date is null
     or v_credential.expiry_date is null
     or v_credential.expiry_date < timezone('Asia/Dubai', pg_catalog.now())::date
     or not exists (
       select 1 from public.pro_credential_evidence evidence
       where evidence.credential_id = p_credential_id
         and evidence.scan_completed_at is not null
     ) then
    raise exception using errcode = 'P0001', message = 'CREDENTIAL_INCOMPLETE';
  end if;

  update public.pro_credentials
  set state = 'submitted', submitted_at = pg_catalog.now(), version = version + 1
  where id = p_credential_id;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state,
    actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'submitted', 'draft', 'submitted',
    p_actor_id, v_credential.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_submitted',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.begin_pro_credential_review(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  update public.pro_credentials set state = 'under_review', version = version + 1
  where id = p_credential_id;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state,
    actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'review_started', 'submitted',
    'under_review', p_actor_id, v_credential.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_review_started',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.verify_pro_credential(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
  v_updated_count integer;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'under_review' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  if v_credential.expiry_date < timezone('Asia/Dubai', pg_catalog.now())::date then
    raise exception using errcode = 'P0001', message = 'PRO_CREDENTIAL_EXPIRED';
  end if;
  update public.pro_credentials set state = 'verified', version = version + 1
  where id = p_credential_id
    and version = p_expected_version
    and state = 'under_review';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state,
    actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'verified', 'under_review',
    'verified', p_actor_id, v_credential.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_verified',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.reject_pro_credential(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_reason_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'under_review' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  perform public.assert_safe_pro_decision_reason(p_reason_code, p_reason);
  update public.pro_credentials set state = 'rejected', version = version + 1
  where id = p_credential_id;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state, reason_code,
    reason, actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'rejected', 'under_review',
    'rejected', pg_catalog.upper(pg_catalog.btrim(p_reason_code)),
    pg_catalog.btrim(p_reason), p_actor_id, v_credential.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_rejected',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.revoke_pro_credential(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_reason_code text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state <> 'verified' then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  perform public.assert_safe_pro_decision_reason(p_reason_code, p_reason);
  update public.pro_credentials set state = 'revoked', version = version + 1
  where id = p_credential_id;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state, reason_code,
    reason, actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'revoked', 'verified', 'revoked',
    pg_catalog.upper(pg_catalog.btrim(p_reason_code)), pg_catalog.btrim(p_reason),
    p_actor_id, v_credential.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_revoked',
    p_credential_id, v_credential.version + 1
  );
  v_result := public.pro_credential_masked_result(p_credential_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.create_pro_credential_replacement(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_new_id uuid;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id from public.pro_credentials
  where id = p_credential_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential from public.pro_credentials
  where id = p_credential_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_credential_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_credential.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_CREDENTIAL_VERSION';
  end if;
  if v_credential.state not in ('rejected', 'expired', 'revoked') then
    raise exception using errcode = 'P0001', message = 'INVALID_CREDENTIAL_TRANSITION';
  end if;
  insert into public.pro_credentials (
    pro_profile_id, credential_type, supersedes_credential_id, created_by
  ) values (
    v_credential.pro_profile_id, v_credential.credential_type, p_credential_id, p_actor_id
  ) returning id into v_new_id;
  insert into public.pro_credential_decisions (
    pro_profile_id, credential_id, event, from_state, to_state,
    actor_profile_id, credential_version
  ) values (
    v_credential.pro_profile_id, p_credential_id, 'superseded', v_credential.state,
    v_credential.state, p_actor_id, v_credential.version
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_credential.pro_profile_id, 'credential_replacement_created',
    v_new_id, 0
  );
  v_result := public.pro_credential_masked_result(v_new_id);
  perform public.store_pro_lifecycle_receipt(
    'credential', p_credential_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.open_pro_credential_evidence_metadata(
  p_actor_id uuid,
  p_evidence_id uuid
)
returns table (
  evidence_id uuid,
  pro_profile_id uuid,
  credential_id uuid,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  original_name_safe text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pro_profile_id uuid;
begin
  select evidence.pro_profile_id into v_pro_profile_id
  from public.pro_credential_evidence evidence
  where evidence.id = p_evidence_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.authorize_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  return query
  select evidence.id, evidence.pro_profile_id, evidence.credential_id,
         evidence.storage_path, evidence.mime_type, evidence.size_bytes,
         evidence.original_name_safe
  from public.pro_credential_evidence evidence
  where evidence.id = p_evidence_id;
end;
$$;

create or replace function public.create_pro_commercial_term_draft(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_term_kind public.pro_term_kind,
  p_model public.pro_term_model,
  p_amount_minor bigint,
  p_retainer_interval public.pro_term_interval,
  p_effective_from date,
  p_effective_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_term_id uuid;
  v_version bigint;
  v_result jsonb;
begin
  perform public.assert_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, true);
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_pro_profile_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.pro_commercial_terms
  where pro_profile_id = p_pro_profile_id and term_kind = p_term_kind
  order by version for update;
  select coalesce(pg_catalog.max(version), 0) + 1 into v_version
  from public.pro_commercial_terms
  where pro_profile_id = p_pro_profile_id and term_kind = p_term_kind;
  insert into public.pro_commercial_terms (
    pro_profile_id, term_kind, model, currency, amount_minor, retainer_interval,
    scope, effective_from, effective_to, status, version, created_by
  ) values (
    p_pro_profile_id, p_term_kind, p_model, 'AED', p_amount_minor,
    p_retainer_interval, 'all_registrations', p_effective_from, p_effective_to,
    'draft', v_version, p_actor_id
  ) returning id into v_term_id;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    p_pro_profile_id, v_term_id, 'created', null, 'draft', p_actor_id, v_version
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, p_pro_profile_id, 'commercial_term_created', v_term_id, v_version
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', v_term_id,
    'termKind', p_term_kind::text,
    'model', p_model::text,
    'currency', 'AED',
    'amountMinor', p_amount_minor,
    'retainerInterval', p_retainer_interval::text,
    'scope', 'all_registrations',
    'effectiveFrom', p_effective_from,
    'effectiveTo', p_effective_to,
    'status', 'draft',
    'version', v_version
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_pro_profile_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.activate_pro_commercial_term(
  p_actor_id uuid,
  p_term_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.pro_commercial_terms%rowtype;
  v_pro_profile_id uuid;
  v_previous public.pro_commercial_terms%rowtype;
  v_replay jsonb;
  v_result jsonb;
  v_previous_end date;
  v_updated_count integer;
begin
  select pro_profile_id into v_pro_profile_id
  from public.pro_commercial_terms where id = p_term_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_term from public.pro_commercial_terms
  where id = p_term_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_term.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  if v_term.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'INVALID_TERM_TRANSITION';
  end if;

  select * into v_previous
  from public.pro_commercial_terms
  where pro_profile_id = v_term.pro_profile_id
    and term_kind = v_term.term_kind
    and status = 'active'
  for update;
  if found then
    v_previous_end := v_term.effective_from - 1;
    if v_previous_end < v_previous.effective_from then
      raise exception using errcode = 'P0001', message = 'TERM_DATE_OVERLAP';
    end if;
    update public.pro_commercial_terms
    set status = 'ended', effective_to = v_previous_end, version = version + 1
    where id = v_previous.id;
    insert into public.pro_commercial_term_events (
      pro_profile_id, commercial_term_id, event, from_status, to_status,
      actor_profile_id, term_version
    ) values (
      v_previous.pro_profile_id, v_previous.id, 'ended', 'active', 'ended',
      p_actor_id, v_previous.version + 1
    );
    perform public.write_pro_lifecycle_audit(
      p_actor_id, v_previous.pro_profile_id, 'commercial_term_ended',
      v_previous.id, v_previous.version + 1
    );
  end if;

  update public.pro_commercial_terms
  set status = 'active', version = version + 1
  where id = p_term_id
    and version = p_expected_version
    and status = 'draft';
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    v_term.pro_profile_id, p_term_id, 'activated', 'draft', 'active',
    p_actor_id, v_term.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_term.pro_profile_id, 'commercial_term_activated',
    p_term_id, v_term.version + 1
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', p_term_id,
    'termKind', v_term.term_kind::text,
    'status', 'active',
    'version', v_term.version + 1
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.end_pro_commercial_term(
  p_actor_id uuid,
  p_term_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_effective_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.pro_commercial_terms%rowtype;
  v_pro_profile_id uuid;
  v_replay jsonb;
  v_result jsonb;
begin
  select pro_profile_id into v_pro_profile_id
  from public.pro_commercial_terms where id = p_term_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, true);
  select * into strict v_term from public.pro_commercial_terms
  where id = p_term_id for update;
  v_replay := public.pro_lifecycle_replay_result(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if v_term.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'STALE_TERM_VERSION';
  end if;
  if v_term.status <> 'active' or p_effective_to < v_term.effective_from then
    raise exception using errcode = 'P0001', message = 'INVALID_TERM_TRANSITION';
  end if;
  update public.pro_commercial_terms
  set status = 'ended', effective_to = p_effective_to, version = version + 1
  where id = p_term_id;
  insert into public.pro_commercial_term_events (
    pro_profile_id, commercial_term_id, event, from_status, to_status,
    actor_profile_id, term_version
  ) values (
    v_term.pro_profile_id, p_term_id, 'ended', 'active', 'ended',
    p_actor_id, v_term.version + 1
  );
  perform public.write_pro_lifecycle_audit(
    p_actor_id, v_term.pro_profile_id, 'commercial_term_ended',
    p_term_id, v_term.version + 1
  );
  v_result := pg_catalog.jsonb_build_object(
    'termId', p_term_id,
    'termKind', v_term.term_kind::text,
    'status', 'ended',
    'effectiveTo', p_effective_to,
    'version', v_term.version + 1
  );
  perform public.store_pro_lifecycle_receipt(
    'commercial_term', p_term_id, p_operation_id, p_payload_hash, v_result
  );
  return v_result;
end;
$$;

create or replace function public.evaluate_pro_assignment_eligibility(
  p_pro_profile_id uuid,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_codes jsonb := '[]'::jsonb;
  v_profile public.profiles%rowtype;
  v_credential public.pro_credentials%rowtype;
  v_latest public.pro_credentials%rowtype;
  v_pricing_id uuid;
  v_compensation_id uuid;
  v_company_status text;
  v_tenant_status text;
  v_today date := timezone('Asia/Dubai', pg_catalog.now())::date;
begin
  select * into v_profile from public.profiles where id = p_pro_profile_id;
  if not found or v_profile.role <> 'pro' or v_profile.status <> 'active' then
    v_codes := v_codes || pg_catalog.to_jsonb('PRO_ACCOUNT_INACTIVE'::text);
  end if;

  select * into v_credential
  from public.pro_credentials
  where pro_profile_id = p_pro_profile_id
    and credential_type = 'pro_license'
    and state = 'verified'
    and expiry_date >= v_today
  order by expiry_date desc, id
  limit 1;
  if not found then
    select * into v_latest
    from public.pro_credentials
    where pro_profile_id = p_pro_profile_id and credential_type = 'pro_license'
    order by created_at desc, id desc
    limit 1;
    if not found then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_MISSING'::text);
    elsif v_latest.state = 'draft' then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_DRAFT'::text);
    elsif v_latest.state = 'submitted' then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_SUBMITTED'::text);
    elsif v_latest.state = 'under_review' then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_UNDER_REVIEW'::text);
    elsif v_latest.state = 'rejected' then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_REJECTED'::text);
    elsif v_latest.state = 'expired'
       or (v_latest.state = 'verified' and v_latest.expiry_date < v_today) then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_EXPIRED'::text);
    elsif v_latest.state = 'revoked' then
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_REVOKED'::text);
    else
      v_codes := v_codes || pg_catalog.to_jsonb('PRO_CREDENTIAL_MISSING'::text);
    end if;
  end if;

  if exists (
    select 1 from public.pro_company_assignments
    where pro_profile_id = p_pro_profile_id and status = 'active'
  ) then
    v_codes := v_codes || pg_catalog.to_jsonb('PRO_ALREADY_ASSIGNED'::text);
  end if;

  select id into v_pricing_id from public.pro_commercial_terms
  where pro_profile_id = p_pro_profile_id and term_kind = 'pricing'
    and status = 'active' and effective_from <= v_today
    and (effective_to is null or effective_to >= v_today)
  order by effective_from desc, id desc limit 1;
  if not found then
    v_codes := v_codes || pg_catalog.to_jsonb('PRICING_TERMS_MISSING'::text);
  end if;
  select id into v_compensation_id from public.pro_commercial_terms
  where pro_profile_id = p_pro_profile_id and term_kind = 'compensation'
    and status = 'active' and effective_from <= v_today
    and (effective_to is null or effective_to >= v_today)
  order by effective_from desc, id desc limit 1;
  if not found then
    v_codes := v_codes || pg_catalog.to_jsonb('COMPENSATION_TERMS_MISSING'::text);
  end if;

  if p_company_id is not null then
    select company.status::text, tenant.status::text
      into v_company_status, v_tenant_status
    from public.company_profiles company
    join public.tenants tenant on tenant.id = company.tenant_id
    where company.id = p_company_id;
    if not found or v_company_status in ('suspended', 'churned')
       or v_tenant_status not in ('pending', 'unassigned', 'active') then
      v_codes := v_codes || pg_catalog.to_jsonb('COMPANY_INACTIVE'::text);
    end if;
    if exists (
      select 1 from public.pro_company_assignments
      where company_id = p_company_id and status = 'active'
    ) then
      v_codes := v_codes || pg_catalog.to_jsonb('COMPANY_ALREADY_ASSIGNED'::text);
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'eligible', pg_catalog.jsonb_array_length(v_codes) = 0,
    'codes', v_codes,
    'verifiedCredentialId', v_credential.id,
    'pricingTermId', v_pricing_id,
    'compensationTermId', v_compensation_id
  );
end;
$$;

create or replace function public.read_pro_lifecycle_timeline(
  p_actor_id uuid,
  p_pro_profile_id uuid,
  p_limit integer default 25,
  p_cursor_event_at timestamptz default null,
  p_cursor_event_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  perform public.authorize_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, false);
  if p_limit < 1 or p_limit > 100
     or ((p_cursor_event_at is null) <> (p_cursor_event_id is null)) then
    raise exception using errcode = 'P0001', message = 'INVALID_CURSOR';
  end if;
  with events as (
    select decision.created_at as event_at,
           decision.id as event_id,
           'credential_' || decision.event::text as event_kind,
           pg_catalog.upper(decision.event::text) as summary_code,
           actor.full_name as actor_display_name,
           null::text as company_display_name
    from public.pro_credential_decisions decision
    left join public.profiles actor on actor.id = decision.actor_profile_id
    where decision.pro_profile_id = p_pro_profile_id
    union all
    select assignment.assigned_at, assignment.id, 'assignment_assigned',
           'ASSIGNED', actor.full_name,
           coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.assigned_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id
    union all
    select assignment.released_at, assignment.id, 'assignment_released',
           'RELEASED', actor.full_name,
           coalesce(company.display_name, company.company_name)
    from public.pro_company_assignments assignment
    left join public.profiles actor on actor.id = assignment.released_by
    left join public.company_profiles company on company.id = assignment.company_id
    where assignment.pro_profile_id = p_pro_profile_id
      and assignment.released_at is not null
  ), page as (
    select * from events
    where p_cursor_event_at is null
       or (event_at, event_id) < (p_cursor_event_at, p_cursor_event_id)
    order by event_at desc, event_id desc
    limit p_limit
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'eventAt', event_at,
        'eventId', event_id,
        'eventKind', event_kind,
        'summaryCode', summary_code,
        'actorDisplayName', actor_display_name,
        'companyDisplayName', company_display_name
      ) order by event_at desc, event_id desc
    ),
    '[]'::jsonb
  ) into v_items from page;
  return pg_catalog.jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.materialize_expired_pro_credentials()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_count integer := 0;
begin
  for v_credential in
    select * from public.pro_credentials
    where state = 'verified'
      and expiry_date < timezone('Asia/Dubai', pg_catalog.now())::date
    order by id
    for update skip locked
  loop
    update public.pro_credentials set state = 'expired', version = version + 1
    where id = v_credential.id;
    insert into public.pro_credential_decisions (
      pro_profile_id, credential_id, event, from_state, to_state,
      actor_profile_id, credential_version
    ) values (
      v_credential.pro_profile_id, v_credential.id, 'expired', 'verified', 'expired',
      null, v_credential.version + 1
    );
    perform public.write_pro_lifecycle_audit(
      null, v_credential.pro_profile_id, 'credential_expired',
      v_credential.id, v_credential.version + 1
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cleanup_pro_lifecycle_operation_receipts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  delete from public.pro_lifecycle_operation_receipts
  where created_at < pg_catalog.now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

select cron.schedule(
  'pro-credential-expiry-materializer',
  '45 2 * * *',
  'select public.materialize_expired_pro_credentials()'
);
select cron.schedule(
  'pro-lifecycle-receipt-cleanup',
  '15 3 * * *',
  'select public.cleanup_pro_lifecycle_operation_receipts()'
);

do $$
declare
  v_function regprocedure;
  v_function_name text;
begin
  for v_function, v_function_name in
    select procedure.oid::regprocedure, procedure.proname
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'authorize_pro_lifecycle_actor',
        'assert_pro_lifecycle_actor',
        'assert_safe_pro_decision_reason',
        'write_pro_lifecycle_audit',
        'pro_lifecycle_replay_result',
        'store_pro_lifecycle_receipt',
        'pro_credential_masked_result',
        'create_pro_credential_draft',
        'save_pro_credential_draft',
        'register_pro_credential_evidence',
        'remove_pro_credential_evidence',
        'submit_pro_credential',
        'begin_pro_credential_review',
        'verify_pro_credential',
        'reject_pro_credential',
        'revoke_pro_credential',
        'create_pro_credential_replacement',
        'open_pro_credential_evidence_metadata',
        'create_pro_commercial_term_draft',
        'activate_pro_commercial_term',
        'end_pro_commercial_term',
        'evaluate_pro_assignment_eligibility',
        'read_pro_lifecycle_timeline',
        'materialize_expired_pro_credentials',
        'cleanup_pro_lifecycle_operation_receipts'
      )
  loop
    execute pg_catalog.format('alter function %s owner to postgres', v_function);
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated, service_role', v_function
    );
    if v_function_name in (
      'create_pro_credential_draft',
      'save_pro_credential_draft',
      'register_pro_credential_evidence',
      'remove_pro_credential_evidence',
      'submit_pro_credential',
      'begin_pro_credential_review',
      'verify_pro_credential',
      'reject_pro_credential',
      'revoke_pro_credential',
      'create_pro_credential_replacement',
      'open_pro_credential_evidence_metadata',
      'create_pro_commercial_term_draft',
      'activate_pro_commercial_term',
      'end_pro_commercial_term',
      'evaluate_pro_assignment_eligibility',
      'read_pro_lifecycle_timeline',
      'materialize_expired_pro_credentials',
      'cleanup_pro_lifecycle_operation_receipts'
    ) then
      execute pg_catalog.format('grant execute on function %s to service_role', v_function);
    end if;
  end loop;
end;
$$;

commit;
