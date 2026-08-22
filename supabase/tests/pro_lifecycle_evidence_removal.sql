\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;

do $$
begin
  if has_table_privilege('service_role', 'public.pro_credential_evidence_removals', 'SELECT')
     or has_table_privilege('service_role', 'public.pro_credential_evidence_removals', 'INSERT')
     or has_table_privilege('service_role', 'public.pro_credential_evidence_removals', 'UPDATE')
     or has_table_privilege('service_role', 'public.pro_credential_evidence_removals', 'DELETE') then
    raise exception 'SERVICE_ROLE_RESERVATION_TABLE_ACCESS';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.prepare_pro_credential_evidence_removal(uuid,uuid,uuid,bigint,uuid,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.finalize_pro_credential_evidence_removal(uuid,uuid,uuid,bigint,uuid,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.remove_pro_credential_evidence(uuid,uuid,uuid,bigint,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'SERVICE_ROLE_REMOVAL_RPC_PRIVILEGES';
  end if;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'removal-pro@example.invalid', 'synthetic', now(),
  '{}', '{}', now(), now()
);
insert into public.profiles (id, role, status, full_name)
values ('93000000-0000-4000-8000-000000000001', 'pro', 'active', 'Removal PRO');
insert into public.pro_profiles (profile_id)
values ('93000000-0000-4000-8000-000000000001');
insert into public.pro_credentials (id, pro_profile_id, state, version, created_by)
values (
  '93000000-0000-4000-8000-000000000002',
  '93000000-0000-4000-8000-000000000001', 'draft', 0,
  '93000000-0000-4000-8000-000000000001'
);
insert into public.pro_credential_evidence (
  id, pro_profile_id, credential_id, storage_path, mime_type, size_bytes, sha256,
  original_name_safe, scan_provider, scan_completed_at, uploaded_by
) values (
  '93000000-0000-4000-8000-000000000003',
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
  'pro-credentials/93000000-0000-4000-8000-000000000001/93000000-0000-4000-8000-000000000002/93000000-0000-4000-8000-000000000003',
  'application/pdf', 8, repeat('a', 64), 'proof.pdf', 'fixture', now(),
  '93000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_prepared jsonb;
  v_result jsonb;
begin
  v_prepared := public.prepare_pro_credential_evidence_removal(
    '93000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000003', 0,
    '93000000-0000-4000-8000-000000000004', repeat('b', 64)
  );
  if v_prepared ->> 'status' <> 'prepared' or v_prepared ->> 'storagePath' not like 'pro-credentials/%' then
    raise exception 'INVALID_PREPARE_RESULT';
  end if;
  if public.prepare_pro_credential_evidence_removal(
    '93000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000003', 0,
    '93000000-0000-4000-8000-000000000004', repeat('b', 64)
  ) <> v_prepared then raise exception 'PREPARE_REPLAY_CHANGED'; end if;
  begin
    perform public.prepare_pro_credential_evidence_removal(
      '93000000-0000-4000-8000-000000000001',
      '93000000-0000-4000-8000-000000000002',
      '93000000-0000-4000-8000-000000000003', 0,
      '93000000-0000-4000-8000-000000000005', repeat('c', 64)
    );
    raise exception 'EXPECTED_COMPETING_OPERATION';
  exception when others then
    if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
  end;
  begin
    update public.pro_credentials set issuing_authority = 'blocked'
    where id = '93000000-0000-4000-8000-000000000002';
    raise exception 'EXPECTED_MUTATION_BLOCK';
  exception when others then
    if sqlerrm <> 'EVIDENCE_REMOVAL_IN_PROGRESS' then raise; end if;
  end;
  v_result := public.finalize_pro_credential_evidence_removal(
    '93000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000003', 0,
    '93000000-0000-4000-8000-000000000004', repeat('b', 64)
  );
  if v_result ->> 'version' <> '1'
     or exists (select 1 from public.pro_credential_evidence where id = '93000000-0000-4000-8000-000000000003')
     or not exists (
       select 1 from public.pro_credential_evidence_removals
       where evidence_id = '93000000-0000-4000-8000-000000000003'
         and status = 'complete' and storage_path is null
     ) then raise exception 'FINALIZE_INCOMPLETE'; end if;
  if public.finalize_pro_credential_evidence_removal(
    '93000000-0000-4000-8000-000000000001',
    '93000000-0000-4000-8000-000000000002',
    '93000000-0000-4000-8000-000000000003', 0,
    '93000000-0000-4000-8000-000000000004', repeat('b', 64)
  ) <> v_result then raise exception 'FINALIZE_REPLAY_CHANGED'; end if;
end;
$$;

rollback;
