begin;

create or replace function public.prepare_pro_credential_evidence_upload(
  p_actor_id uuid, p_credential_id uuid, p_expected_version bigint,
  p_operation_id uuid, p_payload_hash text, p_evidence_id uuid, p_storage_path text,
  p_mime_type text, p_size_bytes bigint, p_sha256 text, p_original_name_safe text,
  p_scan_provider text, p_scan_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_terminal public.pro_credential_evidence_upload_reservations%rowtype;
  v_replay jsonb;
begin
  select * into v_credential
  from public.pro_credentials
  where id = p_credential_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  begin
    perform public.assert_pro_lifecycle_actor(
      p_actor_id, v_credential.pro_profile_id, false
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;

  select * into v_terminal
  from public.pro_credential_evidence_upload_reservations
  where credential_id = p_credential_id
    and operation_id = p_operation_id
    and status = 'finalized';
  if found then
    if row(
      v_terminal.actor_id, v_terminal.expected_version, v_terminal.payload_hash,
      v_terminal.evidence_id, v_terminal.storage_path, v_terminal.mime_type,
      v_terminal.size_bytes, v_terminal.sha256, v_terminal.original_name_safe,
      v_terminal.scan_provider, v_terminal.scan_completed_at
    ) is distinct from row(
      p_actor_id, p_expected_version, p_payload_hash, p_evidence_id,
      p_storage_path, p_mime_type, p_size_bytes, p_sha256,
      pg_catalog.btrim(p_original_name_safe), pg_catalog.btrim(p_scan_provider),
      p_scan_completed_at
    ) then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    v_replay := public.pro_lifecycle_replay_result(
      'credential', p_credential_id, p_operation_id, p_payload_hash
    );
    if v_replay is null then
      raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_RESERVATION_LOST';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'complete', 'credential', v_replay
    );
  end if;

  if exists (
    select 1 from public.pro_credential_evidence_removals
    where credential_id = p_credential_id and status in ('prepared', 'recovering')
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_REMOVAL_IN_PROGRESS';
  end if;
  return private.prepare_pro_credential_evidence_upload_0086d(
    p_actor_id, p_credential_id, p_expected_version, p_operation_id, p_payload_hash,
    p_evidence_id, p_storage_path, p_mime_type, p_size_bytes, p_sha256,
    p_original_name_safe, p_scan_provider, p_scan_completed_at
  );
end;
$$;

create or replace function public.prepare_pro_credential_evidence_removal(
  p_actor_id uuid, p_credential_id uuid, p_evidence_id uuid,
  p_expected_version bigint, p_operation_id uuid, p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential public.pro_credentials%rowtype;
  v_terminal public.pro_credential_evidence_removals%rowtype;
begin
  select * into v_credential
  from public.pro_credentials
  where id = p_credential_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  begin
    perform public.assert_pro_lifecycle_actor(
      p_actor_id, v_credential.pro_profile_id, false
    );
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;

  select * into v_terminal
  from public.pro_credential_evidence_removals
  where credential_id = p_credential_id
    and operation_id = p_operation_id
    and status = 'complete';
  if found then
    if row(
      v_terminal.actor_id, v_terminal.evidence_id, v_terminal.expected_version,
      v_terminal.payload_hash
    ) is distinct from row(
      p_actor_id, p_evidence_id, p_expected_version, p_payload_hash
    ) then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'complete', 'credential', v_terminal.sanitized_result
    );
  end if;

  if exists (
    select 1 from public.pro_credential_evidence_upload_reservations
    where credential_id = p_credential_id and status in ('prepared', 'recovering')
  ) then
    raise exception using errcode = 'P0001', message = 'EVIDENCE_UPLOAD_IN_PROGRESS';
  end if;
  return private.prepare_pro_credential_evidence_removal_0086d(
    p_actor_id, p_credential_id, p_evidence_id, p_expected_version,
    p_operation_id, p_payload_hash
  );
end;
$$;

alter function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) owner to postgres;
alter function public.prepare_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) owner to postgres;

revoke all on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.prepare_pro_credential_evidence_upload(
  uuid, uuid, bigint, uuid, text, uuid, text, text, bigint, text, text, text, timestamptz
) to service_role;
grant execute on function public.prepare_pro_credential_evidence_removal(
  uuid, uuid, uuid, bigint, uuid, text
) to service_role;

commit;
