-- Private provider identities are read from immutable reservation columns, never
-- inferred from a returned path. Applied authority/state implementations remain
-- owner-only delegates; terminal publication receipts are returned unchanged.
begin;

create or replace function public._document_upload_provider_identity(r public.document_upload_operations)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('tenantId',r.tenant_id,'companyId',r.company_id,
    'operationId',r.operation_id,'objectId',r.object_id,'extension',r.extension,
    'documentId',r.document_id,'versionId',r.reserved_version_id,
    'storageBucket','tenant-documents','storagePath',r.storage_path,'deadlineAt',r.deadline_at);
$$;
alter function public._document_upload_provider_identity(public.document_upload_operations) owner to postgres;
revoke all on function public._document_upload_provider_identity(public.document_upload_operations)
  from public, anon, authenticated, service_role;

alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  rename to _document_upload_prepare_before_provider_identity;
revoke all on function public._document_upload_prepare_before_provider_identity(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  from public, anon, authenticated, service_role;
create or replace function public.prepare_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_request_id uuid,p_document_id uuid,p_employee_id uuid,p_doc_type text,
  p_label text,p_expected_head uuid,p_sha256 text,p_mime_type text,
  p_size_bytes bigint,p_extension text,p_safe_filename text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; r public.document_upload_operations;
begin
  result:=public._document_upload_prepare_before_provider_identity(p_actor_id,p_tenant_id,p_company_id,
    p_operation_id,p_request_id,p_document_id,p_employee_id,p_doc_type,p_label,p_expected_head,
    p_sha256,p_mime_type,p_size_bytes,p_extension,p_safe_filename);
  if result->>'status'='finalized' then return result; end if;
  select * into strict r from public.document_upload_operations where operation_id=p_operation_id
    and actor_id=p_actor_id and tenant_id=p_tenant_id and company_id=p_company_id;
  return result || public._document_upload_provider_identity(r);
end; $$;
alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) owner to postgres;
revoke all on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) to service_role;

alter function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer)
  rename to _document_upload_claim_before_provider_identity;
revoke all on function public._document_upload_claim_before_provider_identity(uuid,uuid,uuid,integer)
  from public, anon, authenticated, service_role;
create or replace function public.claim_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; r public.document_upload_operations;
begin
  result:=public._document_upload_claim_before_provider_identity(p_tenant_id,p_company_id,p_operation_id,p_lease_seconds);
  select * into strict r from public.document_upload_operations where operation_id=p_operation_id
    and tenant_id=p_tenant_id and company_id=p_company_id;
  return result || public._document_upload_provider_identity(r);
end; $$;
alter function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer) to service_role;

alter function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid)
  rename to _document_upload_authorize_before_provider_identity;
revoke all on function public._document_upload_authorize_before_provider_identity(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
create or replace function public.authorize_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_fence uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; r public.document_upload_operations;
begin
  result:=public._document_upload_authorize_before_provider_identity(p_tenant_id,p_company_id,p_operation_id,p_fence);
  select * into strict r from public.document_upload_operations where operation_id=p_operation_id
    and tenant_id=p_tenant_id and company_id=p_company_id;
  return result || public._document_upload_provider_identity(r);
end; $$;
alter function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid) to service_role;

alter function public.reconcile_document_upload_cleanup(uuid,uuid,uuid)
  rename to _document_upload_reconcile_before_provider_identity;
revoke all on function public._document_upload_reconcile_before_provider_identity(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
create or replace function public.reconcile_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; r public.document_upload_operations;
begin
  result:=public._document_upload_reconcile_before_provider_identity(p_tenant_id,p_company_id,p_operation_id);
  if result->>'status' in ('finalized','cleaned') then return result; end if;
  select * into strict r from public.document_upload_operations where operation_id=p_operation_id
    and tenant_id=p_tenant_id and company_id=p_company_id;
  return result || public._document_upload_provider_identity(r);
end; $$;
alter function public.reconcile_document_upload_cleanup(uuid,uuid,uuid) owner to postgres;
revoke all on function public.reconcile_document_upload_cleanup(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_document_upload_cleanup(uuid,uuid,uuid) to service_role;

-- Discovery is only a bounded snapshot; claim and authorization remain mandatory
-- and authoritative immediately before any physical provider deletion.
create or replace function public.list_document_upload_cleanup_candidates(
  p_tenant_id uuid,p_company_id uuid,p_limit integer default 25
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_tenant_id is null or p_company_id is null or p_limit is null
    or p_limit not between 1 and 25 then
    raise exception using errcode='DU422',message='document_upload_invalid';
  end if;
  select coalesce(jsonb_agg(public._document_upload_provider_identity(q::public.document_upload_operations)
      || jsonb_build_object('status',q.state) order by q.deadline_at,q.operation_id),'[]'::jsonb)
    into result
    from (
      select r.* from public.document_upload_operations r
      where r.tenant_id=p_tenant_id and r.company_id=p_company_id
        and ((r.state='prepared' and r.deadline_at<=clock_timestamp())
          or (r.state='cleanup_pending' and r.cleanup_lease_until<=clock_timestamp()))
        and not r.cleanup_hold and r.committed_receipt is null and r.finalized_at is null
        and not exists(select 1 from public.document_versions v
          where v.storage_path=r.storage_path or v.upload_operation_id=r.operation_id
            or v.id=r.reserved_version_id)
        and not exists(select 1 from public.documents d where d.current_version_id=r.reserved_version_id)
        and not exists(select 1 from public.document_lifecycle_audit a
          where a.operation_id=r.operation_id and a.event='upload_finalized')
      order by r.deadline_at,r.operation_id limit p_limit
    ) q;
  return jsonb_build_object('status','candidates','operations',result);
end; $$;
alter function public.list_document_upload_cleanup_candidates(uuid,uuid,integer) owner to postgres;
revoke all on function public.list_document_upload_cleanup_candidates(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_document_upload_cleanup_candidates(uuid,uuid,integer) to service_role;
commit;
