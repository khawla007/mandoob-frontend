-- Preserve an already-protected identifier when an authorized draft save leaves
-- the replacement input blank. New and legacy-incomplete credentials still require it.

drop function if exists public.save_pro_credential_draft(
  uuid, uuid, bigint, uuid, text, text, text, text, text, date, date
);

create function public.save_pro_credential_draft(
  p_actor_id uuid,
  p_credential_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_preserve_identifier boolean,
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
  select pro_profile_id into v_pro_profile_id
  from public.pro_credentials where id = p_credential_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  perform public.assert_pro_lifecycle_actor(p_actor_id, v_pro_profile_id, false);
  select * into strict v_credential
  from public.pro_credentials where id = p_credential_id for update;
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

  if p_preserve_identifier then
    if v_credential.identifier_ciphertext is null
       or v_credential.identifier_hash is null
       or v_credential.identifier_last4 is null
       or v_credential.legacy_unmasked then
      raise exception using errcode = 'P0001', message = 'CREDENTIAL_IDENTIFIER_REQUIRED';
    end if;
    if p_identifier_ciphertext is not null
       or p_identifier_hash is not null
       or p_identifier_last4 is not null then
      raise exception using errcode = '22023', message = 'CREDENTIAL_IDENTIFIER_REQUIRED';
    end if;
  elsif nullif(pg_catalog.btrim(p_identifier_ciphertext), '') is null
        or p_identifier_hash is null
        or p_identifier_hash !~ '^[a-f0-9]{64}$'
        or p_identifier_last4 is null
        or p_identifier_last4 !~ '^[A-Z0-9]{4}$' then
    raise exception using errcode = '22023', message = 'CREDENTIAL_IDENTIFIER_REQUIRED';
  end if;

  update public.pro_credentials
  set identifier_ciphertext = case when p_preserve_identifier
        then v_credential.identifier_ciphertext else p_identifier_ciphertext end,
      identifier_hash = case when p_preserve_identifier
        then v_credential.identifier_hash else p_identifier_hash end,
      identifier_last4 = case when p_preserve_identifier
        then v_credential.identifier_last4 else pg_catalog.upper(p_identifier_last4) end,
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

alter function public.save_pro_credential_draft(
  uuid, uuid, bigint, uuid, text, boolean, text, text, text, text, date, date
) owner to postgres;
revoke all on function public.save_pro_credential_draft(
  uuid, uuid, bigint, uuid, text, boolean, text, text, text, text, date, date
) from public, anon, authenticated;
grant execute on function public.save_pro_credential_draft(
  uuid, uuid, bigint, uuid, text, boolean, text, text, text, text, date, date
) to service_role;
