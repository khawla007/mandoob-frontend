begin;

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
  -- assert_pro_lifecycle_actor locks the target profile, serializing the zero-history check.
  perform public.assert_pro_lifecycle_actor(p_actor_id, p_pro_profile_id, false);
  v_replay := public.pro_lifecycle_replay_result(
    'credential', p_pro_profile_id, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform 1
  from public.pro_credentials
  where pro_profile_id = p_pro_profile_id
    and credential_type = 'pro_license'
  order by id
  limit 1
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'CREDENTIAL_HISTORY_EXISTS';
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

alter function public.create_pro_credential_draft(uuid, uuid, uuid, text) owner to postgres;
revoke all on function public.create_pro_credential_draft(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_pro_credential_draft(uuid, uuid, uuid, text)
  to service_role;

commit;
