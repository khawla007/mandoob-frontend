-- Forward-only upload freshness after operation/resource advisory waits.
-- Retain the full deployed authority/resource checks and immutable publication
-- logic as owner-only delegates. A late denial rolls their changes back atomically.
-- Worker reconciliation deliberately retains historical committed-object proof.
begin;

create or replace function public._document_upload_business_date()
returns date language sql volatile security definer set search_path = '' as $$
  select (clock_timestamp() at time zone 'Asia/Dubai')::date;
$$;
alter function public._document_upload_business_date() owner to postgres;
revoke all on function public._document_upload_business_date()
  from public, anon, authenticated, service_role;

create or replace function public._document_upload_current_pro_credential(p_actor_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id=p_actor_id and status='active' for share nowait;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  if actor.role='pro' then
    -- Existing authority locks cannot freeze calendar time. Newly visible valid
    -- rows also require NOWAIT locks; never introduce inverse lifecycle waits.
    perform 1 from public.pro_credentials where pro_profile_id=p_actor_id
      and credential_type='pro_license' and state='verified'
      and expiry_date >= public._document_upload_business_date()
      order by id for share nowait;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  elsif actor.role not in ('admin','super_admin','customer','employee') then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end;
$$;
alter function public._document_upload_current_pro_credential(uuid) owner to postgres;
revoke all on function public._document_upload_current_pro_credential(uuid)
  from public, anon, authenticated, service_role;

alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  rename to _document_upload_prepare_before_wallclock_authority;
alter function public._document_upload_prepare_before_wallclock_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) owner to postgres;
revoke all on function public._document_upload_prepare_before_wallclock_authority(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  from public, anon, authenticated, service_role;
create or replace function public.prepare_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_request_id uuid,p_document_id uuid,p_employee_id uuid,p_doc_type text,
  p_label text,p_expected_head uuid,p_sha256 text,p_mime_type text,
  p_size_bytes bigint,p_extension text,p_safe_filename text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result:= public._document_upload_prepare_before_wallclock_authority(p_actor_id,p_tenant_id,p_company_id,
    p_operation_id,p_request_id,p_document_id,p_employee_id,p_doc_type,p_label,p_expected_head,
    p_sha256,p_mime_type,p_size_bytes,p_extension,p_safe_filename);
  perform public._document_upload_current_pro_credential(p_actor_id);
  return result;
end;
$$;
alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) owner to postgres;
revoke all on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) to service_role;

alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  rename to _document_upload_finalize_before_wallclock_authority;
alter function public._document_upload_finalize_before_wallclock_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) owner to postgres;
revoke all on function public._document_upload_finalize_before_wallclock_authority(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  from public, anon, authenticated, service_role;
create or replace function public.finalize_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_scan_state text,p_scan_provider text,p_scan_completed_at timestamptz,
  p_storage_path text,p_mime_type text,p_size_bytes bigint,p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result:= public._document_upload_finalize_before_wallclock_authority(p_actor_id,p_tenant_id,p_company_id,
    p_operation_id,p_scan_state,p_scan_provider,p_scan_completed_at,p_storage_path,p_mime_type,p_size_bytes,p_sha256);
  perform public._document_upload_current_pro_credential(p_actor_id);
  return result;
end;
$$;
alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) owner to postgres;
revoke all on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) to service_role;

alter function public.get_document_upload_receipt(uuid,uuid,uuid,uuid)
  rename to _document_upload_receipt_before_wallclock_authority;
alter function public._document_upload_receipt_before_wallclock_authority(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public._document_upload_receipt_before_wallclock_authority(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
create or replace function public.get_document_upload_receipt(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result:= public._document_upload_receipt_before_wallclock_authority(p_actor_id,p_tenant_id,p_company_id,p_operation_id);
  perform public._document_upload_current_pro_credential(p_actor_id);
  return result;
end;
$$;
alter function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) to service_role;

commit;
