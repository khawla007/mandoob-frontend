-- Access-specific forward correction: P303's stable transaction-date seams are
-- preserved. A licence valid at transaction start may expire across a blocking
-- operation/resource advisory wait; recheck access using the actual Dubai day.
-- No public/service clock argument or production override capability is exposed.
begin;

create or replace function public._document_access_business_date()
returns date language sql volatile security definer set search_path = '' as $$
    select (clock_timestamp() at time zone 'Asia/Dubai')::date;
$$;

-- Context already holds authority locks. Lock any wall-clock-valid credential
-- rows too (including a newly visible verified row), without inverse row waits.
-- Original uploader provenance is historical; only the current reader is checked.
create or replace function public._document_access_current_pro_credential(p_actor_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
    select * into actor from public.profiles where id=p_actor_id and status='active';
    if not found then return false; end if;
    if actor.role='pro' then
        perform 1 from public.pro_credentials where pro_profile_id=p_actor_id
            and credential_type='pro_license' and state='verified'
            and expiry_date >= public._document_access_business_date()
            order by id for share nowait;
        return found;
    end if;
    return actor.role in ('admin','super_admin','customer','employee');
exception when lock_not_available then
    raise exception using errcode='DU409',message='document_access_conflict';
end;
$$;

create or replace function public.can_read_document_metadata(
    p_tenant_id uuid,p_company_id uuid,p_employee_id uuid,p_request_id uuid,p_doc_type text
) returns boolean language sql volatile security definer set search_path = '' as $$
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
                or (actor.role='pro' and public.authorize_pro_company_access(actor.id,p_tenant_id,p_company_id)
                    and exists(select 1 from public.pro_credentials credential
                        where credential.pro_profile_id=actor.id and credential.credential_type='pro_license'
                            and credential.state='verified'
                            and credential.expiry_date >= public._document_access_business_date()))
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
    if effective_expires_on < public._document_access_business_date() then
        return jsonb_build_object('status','denied','classification','expired');
    end if;
    -- Authority rows were locked before the resource advisory wait. Locks cannot
    -- freeze calendar time: licence eligibility must be current after all waits.
    if not public._document_access_current_pro_credential(p_actor_id) then
        return jsonb_build_object('status','denied','classification','authority');
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
    -- Recheck immediately before the required grant audit as well as in context.
    if not public._document_access_current_pro_credential(p_actor_id) then
        perform public._document_access_audit(p_actor_id,'access_denied','grant','authority',context,p_lifetime_seconds,null);
        return jsonb_build_object('status','denied');
    end if;
    audit_id := public._document_access_audit(p_actor_id,'access_granted','grant','allowed',context,
        p_lifetime_seconds,p_provider_expires_at);
    return jsonb_build_object('status','granted','auditId',audit_id,'expiresAt',p_provider_expires_at);
end;
$$;

alter function public._document_access_business_date() owner to postgres;
revoke all on function public._document_access_business_date() from public, anon, authenticated, service_role;
alter function public._document_access_current_pro_credential(uuid) owner to postgres;
revoke all on function public._document_access_current_pro_credential(uuid) from public, anon, authenticated, service_role;
alter function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text) owner to postgres;
revoke all on function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text)
    from public, anon, authenticated, service_role;
grant execute on function public.can_read_document_metadata(uuid,uuid,uuid,uuid,text) to authenticated;
alter function public._document_access_context(uuid,uuid,uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public._document_access_context(uuid,uuid,uuid,uuid,uuid,integer)
    from public, anon, authenticated, service_role;
alter function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz) owner to postgres;
revoke all on function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz)
    from public, anon, authenticated, service_role;
grant execute on function public.finalize_document_access_grant(uuid,uuid,uuid,uuid,uuid,uuid,text,integer,timestamptz) to service_role;
commit;
