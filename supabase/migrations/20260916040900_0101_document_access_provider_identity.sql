-- Enrich only private allowed responses from immutable reservation identities.
-- Preserve the applied resolver's authority, wall-clock, denial audit and TTL;
-- final grant continues to recompute its own fresh context and required audit.
begin;

alter function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer)
  rename to _document_access_resolve_before_provider_identity;
alter function public._document_access_resolve_before_provider_identity(uuid,uuid,uuid,uuid,uuid,integer)
  owner to postgres;
revoke all on function public._document_access_resolve_before_provider_identity(uuid,uuid,uuid,uuid,uuid,integer)
  from public, anon, authenticated, service_role;

create or replace function public.resolve_document_access(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_document_id uuid,p_version_id uuid,p_lifetime_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  result:=public._document_access_resolve_before_provider_identity(p_actor_id,p_tenant_id,p_company_id,p_document_id,p_version_id,p_lifetime_seconds);
  if result->>'status'<>'allowed' then return result; end if;

  -- The delegate retains authority/provenance locks. The reader is not required
  -- to be the historical uploader; no identity is parsed from a storage path.
  select result || jsonb_build_object('objectId',r.object_id,'extension',r.extension)
    into result from public.document_upload_operations r
    where r.operation_id=(result->>'operationId')::uuid
      and r.tenant_id=p_tenant_id and r.company_id=p_company_id
      and r.document_id=p_document_id and r.reserved_version_id=p_version_id
      and r.tenant_id=(result->>'tenantId')::uuid
      and r.company_id=(result->>'companyId')::uuid
      and r.document_id=(result->>'documentId')::uuid
      and r.reserved_version_id=(result->>'versionId')::uuid
      and r.request_id is not distinct from (result->>'requestId')::uuid
      and r.sha256=result->>'sha256'
      and r.mime_type=result->>'mimeType' and r.size_bytes=(result->>'sizeBytes')::bigint
      and result->>'storageBucket'='tenant-documents'
      and r.storage_path=result->>'storagePath'
      and r.storage_path=r.tenant_id::text||'/'||r.company_id::text||'/documents/'||r.operation_id::text||'/'||r.object_id::text||'.'||r.extension;
  if not found then
    perform public._document_access_audit(p_actor_id,'access_denied','resolve','unverified',
      null,p_lifetime_seconds,null);
    return jsonb_build_object('status','denied');
  end if;
  return result;
end;
$$;

alter function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer) to service_role;
commit;
