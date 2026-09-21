-- Database prerequisites only. No provider URL creation, byte observation or DAL.
-- Service callers must keep resolver context/URLs private, call grant only after
-- successful bounded provider creation, and release a URL only after grant commit.
-- Legacy request/review/expiry direct writes intentionally fail closed until the
-- separate owner-RPC checkpoint; do not promote stale invoker bodies to definers.
begin;

revoke all on table public.document_requests from public, anon, authenticated, service_role;
revoke all on table public.documents from public, anon, authenticated, service_role;
revoke all on table public.document_versions from public, anon, authenticated, service_role;

-- Table REVOKE does not remove preexisting column grants. Remove the entire
-- effective column ACL before reinstating safe read metadata below.
do $$
declare relation regclass; columns text;
begin
    foreach relation in array array['public.document_requests'::regclass,
        'public.documents'::regclass,'public.document_versions'::regclass] loop
        select string_agg(quote_ident(attname),', ' order by attnum) into columns
        from pg_catalog.pg_attribute where attrelid=relation and attnum>0 and not attisdropped;
        execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s)
            on table %2$s from public, anon, authenticated, service_role',columns,relation);
    end loop;
end;
$$;
grant select on table public.document_requests to authenticated, service_role;
grant select on table public.documents to authenticated, service_role;
grant select on table public.document_versions to service_role;
grant select (id,document_id,tenant_id,mime_type,size_bytes,uploaded_by,review_status,
    review_note,reviewed_by,reviewed_at,created_at) on table public.document_versions to authenticated;

-- These legacy owner-scoped read contracts are server-only; their DAL response
-- sanitization remains a later checkpoint, not client-visible signing context.
revoke all on function public.list_pro_document_center(
    uuid,text,text,uuid,text,date,date,date,date,text,text,uuid,integer,integer)
    from public, anon, authenticated;
grant execute on function public.list_pro_document_center(
    uuid,text,text,uuid,text,date,date,date,date,text,text,uuid,integer,integer) to service_role;
revoke all on function public.get_pro_document_version_history(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_pro_document_version_history(uuid,uuid) to service_role;

-- Public purpose-specific RLS predicate: no actor input, no private DTO, no
-- impersonation capability. Private signer helpers below have no client EXEC.
create or replace function public.can_read_document_metadata(
    p_tenant_id uuid,p_company_id uuid,p_employee_id uuid,p_request_id uuid,p_doc_type text
) returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.profiles actor
        join public.tenants tenant on tenant.id=p_tenant_id and tenant.status='active'
        join public.company_profiles company on company.id=p_company_id and company.tenant_id=tenant.id
        where actor.id=auth.uid() and actor.status='active'
            and (actor.role not in ('admin','super_admin','pro')
                or (actor.mfa_enrolled_at is not null and auth.jwt()->>'aal'='aal2'))
            and p_doc_type in ('passport','visa','emirates_id','trade_license','ejari','moa',
                'shareholder_id','other','aoa','bank_reference_letter','noc','cv_resume',
                'office_lease','medical_certificate','insurance_policy')
            and (p_employee_id is null or exists (
                select 1 from public.employees employee where employee.id=p_employee_id
                    and employee.tenant_id=p_tenant_id and employee.company_id=p_company_id))
            and (p_request_id is null or exists (
                select 1 from public.document_requests request where request.id=p_request_id
                    and request.tenant_id=p_tenant_id and request.company_id=p_company_id
                    and request.employee_id is not distinct from p_employee_id
                    and request.doc_type=p_doc_type))
            and (
                (actor.role in ('admin','super_admin') and actor.tenant_id is null)
                or (actor.role='pro' and public.authorize_pro_company_access(actor.id,p_tenant_id,p_company_id))
                or (actor.role='customer' and actor.tenant_id=p_tenant_id and exists (
                    select 1 from public.customer_profiles customer where customer.profile_id=actor.id
                        and customer.linked_company_id=p_company_id))
                or (actor.role='employee' and actor.tenant_id=p_tenant_id
                    and p_employee_id is not null and p_request_id is not null and exists (
                        select 1 from public.employees employee where employee.id=p_employee_id
                            and employee.tenant_id=p_tenant_id and employee.company_id=p_company_id
                            and employee.profile_id=actor.id and employee.status='active'))
            )
    );
$$;
alter function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text) owner to postgres;
revoke all on function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text)
    from public, anon, authenticated, service_role;
grant execute on function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text) to authenticated;

-- Reconstruct the cumulative lineage: 0019 -> role rebase -> 0040 -> 0060.
-- Replacing only newly named policies leaves permissive old ALL policies live.
do $$
declare policy record;
begin
    for policy in select namespace.nspname,relation.relname,p.polname
        from pg_catalog.pg_policy p join pg_catalog.pg_class relation on relation.oid=p.polrelid
        join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
        where namespace.nspname='public'
            and relation.relname in ('document_requests','documents','document_versions') loop
        execute format('drop policy %I on %I.%I',policy.polname,policy.nspname,policy.relname);
    end loop;
end;
$$;
alter table public.document_requests enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
create policy document_requests_scoped_metadata on public.document_requests for select to authenticated
    using (public.can_read_document_metadata(tenant_id,company_id,employee_id,id,doc_type));
create policy documents_scoped_metadata on public.documents for select to authenticated
    using (public.can_read_document_metadata(tenant_id,company_id,employee_id,request_id,doc_type));
create policy document_versions_scoped_metadata on public.document_versions for select to authenticated
    using (exists(select 1 from public.documents document where document.id=document_versions.document_id
        and document.tenant_id=document_versions.tenant_id
        and public.can_read_document_metadata(document.tenant_id,document.company_id,
            document.employee_id,document.request_id,document.doc_type)));

-- Do not drop/rewrite shared credential or other-bucket policies. Restrictive
-- composition denies every general path even if an old permissive policy matches.
-- Service provider upload/download and the 404 canonical write guard stay intact.
update storage.buckets set public=false where id='tenant-documents';
create policy document_general_objects_private on storage.objects as restrictive for all to anon, authenticated
    using (bucket_id <> 'tenant-documents' or name like 'pro-credentials/%')
    with check (bucket_id <> 'tenant-documents' or name like 'pro-credentials/%');

-- Historical snapshots, deliberately no parent FKs/cascades, free-form JSON,
-- filename/path, URL, token, provider body/error or observed-download claim.
create table public.document_access_audit (
    id uuid primary key default gen_random_uuid(),
    event text not null check (event in ('access_denied','access_granted')),
    phase text not null check (phase in ('resolve','grant')),
    classification text not null check (classification in (
        'invalid','authority','resource','unverified','rejected','expired','stale','allowed')),
    actor_id uuid,
    tenant_id uuid,
    company_id uuid,
    request_id uuid,
    document_id uuid,
    version_id uuid,
    operation_id uuid,
    sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
    signing_lifetime_seconds integer check (signing_lifetime_seconds between 1 and 300),
    expires_at timestamptz,
    occurred_at timestamptz not null default clock_timestamp(),
    constraint document_access_audit_grant_complete check (
        (event='access_granted' and phase='grant' and classification='allowed'
            and actor_id is not null and tenant_id is not null and company_id is not null
            and document_id is not null and version_id is not null and operation_id is not null
            and sha256 is not null and signing_lifetime_seconds is not null and expires_at is not null)
        or (event='access_denied' and classification<>'allowed' and expires_at is null))
);
alter table public.document_access_audit enable row level security;
revoke all on table public.document_access_audit from public, anon, authenticated, service_role;
create trigger document_access_audit_immutable before update or delete on public.document_access_audit
    for each row execute function public._document_upload_deny_history_mutation();
create trigger document_access_audit_no_truncate before truncate on public.document_access_audit
    for each statement execute function public._document_upload_deny_history_mutation();

-- Private fresh chain resolver. Initial unlocked scoped reads discover the upload
-- operation only; every authority/resource/provenance field is reread under locks.
-- Shared order matches 403/404. NOWAIT avoids inverse waits with P303 release or
-- reassignment; actual contention is DU409, not an authorization-denial event.
create or replace function public._document_access_context(
    p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_document_id uuid,p_version_id uuid,p_lifetime_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    discovered_operation_id uuid; operation public.document_upload_operations;
    document public.documents; version public.document_versions; request public.document_requests;
    company public.company_profiles; employee public.employees; object storage.objects;
    effective_expires_on date;
begin
    if p_actor_id is null or p_tenant_id is null or p_company_id is null or p_document_id is null
        or p_version_id is null or p_lifetime_seconds is null or p_lifetime_seconds not between 1 and 300 then
        return jsonb_build_object('status','denied','classification','invalid');
    end if;
    select v.upload_operation_id into discovered_operation_id from public.document_versions v
        join public.documents d on d.id=v.document_id and d.tenant_id=v.tenant_id
        where v.id=p_version_id and d.id=p_document_id and d.tenant_id=p_tenant_id and d.company_id=p_company_id;
    if not found then return jsonb_build_object('status','denied','classification','resource'); end if;
    if discovered_operation_id is null then return jsonb_build_object('status','denied','classification','unverified'); end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'document-upload-operation:'||discovered_operation_id::text,0));
    select * into operation from public.document_upload_operations r where r.operation_id=discovered_operation_id
        and r.tenant_id=p_tenant_id and r.company_id=p_company_id and r.document_id=p_document_id
        and r.reserved_version_id=p_version_id for share nowait;
    if not found then return jsonb_build_object('status','denied','classification','unverified'); end if;
    begin
        perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,
            operation.employee_id,operation.request_id);
    exception when sqlstate 'DU403' then
        return jsonb_build_object('status','denied','classification','authority');
    end;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        jsonb_build_array('document-upload-resource',operation.tenant_id,operation.company_id,
            operation.request_id,operation.employee_id,operation.doc_type)::text,0));
    if operation.request_id is not null then
        select * into request from public.document_requests where id=operation.request_id
            and tenant_id=p_tenant_id and company_id=p_company_id for share nowait;
        if not found or request.employee_id is distinct from operation.employee_id
            or request.doc_type is distinct from operation.doc_type or request.status not in ('pending','fulfilled') then
            return jsonb_build_object('status','denied','classification','resource');
        end if;
    end if;
    select * into document from public.documents where id=p_document_id and tenant_id=p_tenant_id
        and company_id=p_company_id for share nowait;
    if not found or row(document.request_id,document.employee_id,document.doc_type)
        is distinct from row(operation.request_id,operation.employee_id,operation.doc_type) then
        return jsonb_build_object('status','denied','classification','resource');
    end if;
    select * into version from public.document_versions where id=p_version_id and tenant_id=p_tenant_id
        and document_id=p_document_id for share nowait;
    if not found or version.upload_operation_id is distinct from operation.operation_id
        or row(version.id,version.tenant_id,version.document_id,version.storage_path,version.sha256,
            version.mime_type,version.size_bytes,version.uploaded_by,version.created_at)
        is distinct from row(operation.reserved_version_id,operation.tenant_id,operation.document_id,
            operation.storage_path,operation.sha256,operation.mime_type,operation.size_bytes,
            operation.actor_id,operation.finalized_at)
        or not (operation.state='finalized' and operation.scan_provider='clamav')
        or operation.scan_completed_at is null or operation.finalized_at is null
        or operation.scan_completed_at < operation.prepared_at
        or operation.scan_completed_at > operation.finalized_at or operation.finalized_at > clock_timestamp()
        or operation.committed_receipt is null or operation.cleanup_authorized
        or operation.storage_path is distinct from operation.tenant_id::text||'/'||operation.company_id::text
            ||'/documents/'||operation.operation_id::text||'/'||operation.object_id::text||'.'||operation.extension then
        return jsonb_build_object('status','denied','classification','unverified');
    end if;
    if version.review_status='rejected' then
        return jsonb_build_object('status','denied','classification','rejected');
    elsif version.review_status not in ('pending','approved') then
        return jsonb_build_object('status','denied','classification','unverified');
    end if;
    -- Required historical publication proof, not active uploader authority.
    perform 1 from public.document_lifecycle_audit where event='upload_finalized'
        and operation_id=operation.operation_id and actor_id=operation.actor_id
        and tenant_id=operation.tenant_id and company_id=operation.company_id
        and request_id is not distinct from operation.request_id
        and document_id=operation.document_id and version_id=operation.reserved_version_id
        and sha256=operation.sha256 for share nowait;
    if not found then return jsonb_build_object('status','denied','classification','unverified'); end if;
    select * into object from storage.objects where bucket_id='tenant-documents'
        and name=operation.storage_path for share nowait;
    if not found or jsonb_typeof(object.metadata->'size') not in ('number','string')
        or (object.metadata->>'size') is distinct from operation.size_bytes::text
        or (object.metadata->>'mimetype') is distinct from operation.mime_type then
        return jsonb_build_object('status','denied','classification','unverified');
    end if;
    select * into company from public.company_profiles where id=p_company_id and tenant_id=p_tenant_id;
    if operation.employee_id is not null then
        select * into employee from public.employees where id=operation.employee_id and tenant_id=p_tenant_id
            and company_id=p_company_id;
    end if;
    effective_expires_on := case
        when document.doc_type='trade_license' then company.license_expiry
        when document.doc_type='visa' and document.employee_id is not null then employee.visa_expiry
        when document.doc_type='emirates_id' and document.employee_id is not null then employee.eid_expiry
        else document.expires_on end;
    if effective_expires_on < (clock_timestamp() at time zone 'Asia/Dubai')::date then
        return jsonb_build_object('status','denied','classification','expired');
    end if;
    return jsonb_build_object('status','allowed','tenantId',operation.tenant_id,'companyId',operation.company_id,
        'requestId',operation.request_id,'documentId',document.id,'versionId',version.id,
        'operationId',operation.operation_id,'sha256',version.sha256,'storageBucket','tenant-documents',
        'storagePath',operation.storage_path,'mimeType',version.mime_type,'sizeBytes',version.size_bytes,
        'expiresAt',clock_timestamp()+pg_catalog.make_interval(secs=>p_lifetime_seconds));
exception when lock_not_available then
    raise exception using errcode='DU409',message='document_access_conflict';
end;
$$;

-- Only bounded identifiers/classifications are recorded. For denied foreign or
-- unknown resources no attempted resource IDs/hash are asserted as known facts.
create or replace function public._document_access_audit(
    p_actor_id uuid,p_event text,p_phase text,p_classification text,p_context jsonb,
    p_lifetime_seconds integer,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare audit_id uuid; known_actor uuid;
begin
    select id into known_actor from public.profiles where id=p_actor_id;
    insert into public.document_access_audit(event,phase,classification,actor_id,tenant_id,company_id,
        request_id,document_id,version_id,operation_id,sha256,signing_lifetime_seconds,expires_at)
    values(p_event,p_phase,p_classification,known_actor,(p_context->>'tenantId')::uuid,
        (p_context->>'companyId')::uuid,(p_context->>'requestId')::uuid,(p_context->>'documentId')::uuid,
        (p_context->>'versionId')::uuid,(p_context->>'operationId')::uuid,p_context->>'sha256',
        case when p_lifetime_seconds between 1 and 300 then p_lifetime_seconds end,p_expires_at)
    returning id into audit_id;
    return audit_id;
end;
$$;

create or replace function public.resolve_document_access(
    p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_document_id uuid,p_version_id uuid,p_lifetime_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare context jsonb;
begin
    context := public._document_access_context(p_actor_id,p_tenant_id,p_company_id,p_document_id,p_version_id,p_lifetime_seconds);
    if context->>'status'='denied' then
        perform public._document_access_audit(p_actor_id,'access_denied','resolve',context->>'classification',
            null,p_lifetime_seconds,null);
        -- Return, never INSERT then RAISE: the denial audit must commit.
        return jsonb_build_object('status','denied');
    end if;
    return context;
end;
$$;

-- Provider success is a server-private precondition, not a SQL attestation of a
-- download. No URL/token/body/error enters this contract. Fresh locks/state checks
-- plus required audit commit gate the future DAL's release of its private URL.
create or replace function public.finalize_document_access_grant(
    p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_document_id uuid,p_version_id uuid,
    p_expected_operation_id uuid,p_expected_sha256 text,p_lifetime_seconds integer,p_provider_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare context jsonb; audit_id uuid; checked_at timestamptz;
begin
    context := public._document_access_context(p_actor_id,p_tenant_id,p_company_id,p_document_id,p_version_id,p_lifetime_seconds);
    if context->>'status'='denied' then
        perform public._document_access_audit(p_actor_id,'access_denied','grant',context->>'classification',
            null,p_lifetime_seconds,null);
        return jsonb_build_object('status','denied');
    end if;
    checked_at := clock_timestamp();
    if p_expected_operation_id is distinct from (context->>'operationId')::uuid
        or p_expected_sha256 is distinct from context->>'sha256' then
        perform public._document_access_audit(p_actor_id,'access_denied','grant','stale',context,p_lifetime_seconds,null);
        return jsonb_build_object('status','denied');
    end if;
    if p_provider_expires_at is null or p_provider_expires_at <= checked_at
        or p_provider_expires_at > checked_at+pg_catalog.make_interval(secs=>p_lifetime_seconds) then
        perform public._document_access_audit(p_actor_id,'access_denied','grant','invalid',context,p_lifetime_seconds,null);
        return jsonb_build_object('status','denied');
    end if;
    audit_id := public._document_access_audit(p_actor_id,'access_granted','grant','allowed',context,
        p_lifetime_seconds,p_provider_expires_at);
    return jsonb_build_object('status','granted','auditId',audit_id,'expiresAt',p_provider_expires_at);
end;
$$;

alter function public._document_access_context(uuid,uuid,uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public._document_access_context(uuid,uuid,uuid,uuid,uuid,integer)
    from public, anon, authenticated, service_role;
alter function public._document_access_audit(uuid,text,text,text,jsonb,integer,timestamptz) owner to postgres;
revoke all on function public._document_access_audit(uuid,text,text,text,jsonb,integer,timestamptz)
    from public, anon, authenticated, service_role;
alter function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer)
    from public, anon, authenticated, service_role;
grant execute on function public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer) to service_role;
alter function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz) owner to postgres;
revoke all on function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz)
    from public, anon, authenticated, service_role;
grant execute on function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz) to service_role;
commit;
