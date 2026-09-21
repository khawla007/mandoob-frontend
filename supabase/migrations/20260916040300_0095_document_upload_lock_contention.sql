-- Forward-only nonblocking publication locks. Existing P303 lifecycle RPCs
-- acquire an inverse company/profile chain; contention must fail closed, not wait.
-- Only our lifecycle functions change; operation/resource advisory order remains.
begin;

create or replace function public._document_upload_lock_authority(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_employee_id uuid,p_request_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  perform 1 from public.tenants where id=p_tenant_id and status='active' for share nowait;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  select * into actor from public.profiles where id=p_actor_id and status='active' for share nowait;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  if actor.role in ('admin','super_admin') then
    if actor.tenant_id is not null then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  elsif actor.role='pro' then
    perform 1 from public.pro_credentials
    where pro_profile_id=p_actor_id and credential_type='pro_license' and state='verified'
      and expiry_date >= timezone('Asia/Dubai',pg_catalog.now())::date
    order by id for share nowait;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    perform 1 from public.pro_company_assignments
    where pro_profile_id=p_actor_id and tenant_id=p_tenant_id and company_id=p_company_id
      and status='active' order by id for share nowait;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  elsif actor.role='customer' then
    if actor.tenant_id is distinct from p_tenant_id then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    perform 1 from public.customer_profiles
    where profile_id=p_actor_id and linked_company_id=p_company_id for share nowait;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  elsif actor.role='employee' then
    if actor.tenant_id is distinct from p_tenant_id or p_employee_id is null or p_request_id is null then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  else
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  -- Company onboarding status is not an upload-authority gate.
  perform 1 from public.company_profiles where id=p_company_id and tenant_id=p_tenant_id for share nowait;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  if p_employee_id is not null then
    perform 1 from public.employees where id=p_employee_id and tenant_id=p_tenant_id
      and company_id=p_company_id
      and (actor.role <> 'employee' or (profile_id=p_actor_id and status='active')) for share nowait;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  end if;
end;
$$;

alter function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

create or replace function public._document_upload_lock_resource(
  p_tenant_id uuid,p_company_id uuid,p_request_id uuid,p_employee_id uuid,
  p_doc_type text,p_document_id uuid,p_allow_fulfilled boolean
) returns public.documents language plpgsql security definer set search_path = '' as $$
declare request public.document_requests; head public.documents; matches integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    jsonb_build_array('document-upload-resource',p_tenant_id,p_company_id,p_request_id,
      p_employee_id,p_doc_type)::text,0));
  if p_request_id is not null then
    select * into request from public.document_requests
    where id=p_request_id and tenant_id=p_tenant_id and company_id=p_company_id
      and employee_id is not distinct from p_employee_id and doc_type=p_doc_type
    for update nowait;
    if not found or request.tenant_id is distinct from p_tenant_id
       or request.company_id is distinct from p_company_id
       or request.employee_id is distinct from p_employee_id
       or request.doc_type is distinct from p_doc_type then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    if request.status <> 'pending' and not (p_allow_fulfilled and request.status='fulfilled') then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  end if;
  -- Lock every matching legacy head and fail closed rather than picking one.
  for head in select * from public.documents
    where tenant_id=p_tenant_id and company_id=p_company_id
      and request_id is not distinct from p_request_id
      and employee_id is not distinct from p_employee_id and doc_type=p_doc_type
    order by id for update nowait loop
    matches := matches + 1;
  end loop;
  if matches > 1 then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  if p_document_id is not null then
    if matches <> 1 or head.id is distinct from p_document_id then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  end if;
  return head;
end;
$$;

alter function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean) owner to postgres;
revoke all on function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.prepare_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_request_id uuid,p_document_id uuid,p_employee_id uuid,p_doc_type text,
  p_label text,p_expected_head uuid,p_sha256 text,p_mime_type text,
  p_size_bytes bigint,p_extension text,p_safe_filename text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.document_upload_operations; head public.documents; fingerprint text;
  object_id uuid; reserved_document uuid; prepared timestamptz;
begin
  if p_actor_id is null or p_tenant_id is null or p_company_id is null or p_operation_id is null
     or p_doc_type is null or p_doc_type not in ('passport','visa','emirates_id',
       'trade_license','ejari','moa','shareholder_id','other','aoa','bank_reference_letter',
       'noc','cv_resume','office_lease','medical_certificate','insurance_policy')
     or p_size_bytes is null or p_size_bytes not between 1 and 26214400
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_safe_filename is null or char_length(p_safe_filename) not between 1 and 255
     or p_safe_filename !~ '^[A-Za-z0-9_. -]+$' or p_safe_filename ~ '[.][.]'
     or (p_label is not null and (char_length(p_label)>200 or p_label ~ '[[:cntrl:]]'))
     or p_mime_type is null or p_extension is null
     or not ((p_mime_type='application/pdf' and p_extension='pdf')
       or (p_mime_type='image/jpeg' and p_extension='jpg')
       or (p_mime_type='image/png' and p_extension='png')
       or (p_mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and p_extension='docx')
       or (p_mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and p_extension='xlsx')) then
    raise exception using errcode='DU422',message='document_upload_invalid';
  end if;
  fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    jsonb_build_array(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_request_id,
      p_document_id,p_employee_id,p_doc_type,p_label,p_expected_head,p_sha256,p_mime_type,
      p_size_bytes,p_extension,p_safe_filename)::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:' || p_operation_id::text,0));
  select * into r from public.document_upload_operations where operation_id=p_operation_id for update nowait;
  if found then
    if r.payload_fingerprint is distinct from fingerprint then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
    perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,p_employee_id,p_request_id);
    head := public._document_upload_lock_resource(p_tenant_id,p_company_id,p_request_id,
      p_employee_id,p_doc_type,r.input_document_id,r.state='finalized');
    if r.state='finalized' then
      if head.id is distinct from r.document_id then
        raise exception using errcode='DU403',message='document_upload_forbidden';
      end if;
      return r.committed_receipt;
    end if;
    if r.state <> 'prepared' then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
    if clock_timestamp() >= r.deadline_at then
      raise exception using errcode='DU410',message='document_upload_expired';
    end if;
    if head.current_version_id is distinct from r.expected_head then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  else
    perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,p_employee_id,p_request_id);
    head := public._document_upload_lock_resource(p_tenant_id,p_company_id,p_request_id,
      p_employee_id,p_doc_type,p_document_id,false);
    if head.current_version_id is distinct from p_expected_head then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
    object_id := gen_random_uuid();
    reserved_document := coalesce(head.id,gen_random_uuid());
    prepared := clock_timestamp();
    insert into public.document_upload_operations(operation_id,actor_id,tenant_id,company_id,
      request_id,input_document_id,document_id,employee_id,doc_type,label,expected_head,
      payload_fingerprint,object_id,reserved_version_id,storage_path,mime_type,extension,
      size_bytes,sha256,safe_filename,prepared_at,deadline_at)
    values (p_operation_id,p_actor_id,p_tenant_id,p_company_id,p_request_id,p_document_id,
      reserved_document,p_employee_id,p_doc_type,p_label,p_expected_head,fingerprint,
      object_id,gen_random_uuid(),p_tenant_id::text||'/'||p_company_id::text||'/documents/'
        ||p_operation_id::text||'/'||object_id::text||'.'||p_extension,
      p_mime_type,p_extension,p_size_bytes,p_sha256,p_safe_filename,prepared,prepared+interval '15 minutes')
    returning * into r;
  end if;
  return jsonb_build_object('status','prepared','operationId',r.operation_id,
    'documentId',r.document_id,'versionId',r.reserved_version_id,
    'storageBucket','tenant-documents','storagePath',r.storage_path,'deadlineAt',r.deadline_at);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end;
$$;

alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) owner to postgres;
revoke all on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) to service_role;

create or replace function public.finalize_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_scan_state text,p_scan_provider text,p_scan_completed_at timestamptz,
  p_storage_path text,p_mime_type text,p_size_bytes bigint,p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.document_upload_operations; head public.documents; object storage.objects;
  receipt jsonb; finalized timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:' || p_operation_id::text,0));
  select * into r from public.document_upload_operations
    where operation_id=p_operation_id and actor_id=p_actor_id
      and tenant_id=p_tenant_id and company_id=p_company_id for update nowait;
  if not found or row(r.actor_id,r.tenant_id,r.company_id)
     is distinct from row(p_actor_id,p_tenant_id,p_company_id) then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,r.employee_id,r.request_id);
  head := public._document_upload_lock_resource(p_tenant_id,p_company_id,r.request_id,
    r.employee_id,r.doc_type,r.input_document_id,r.state='finalized');
  -- Even terminal replay must match the original verified server attestation.
  if p_scan_state is distinct from 'clean' or p_scan_provider is distinct from 'clamav'
     or p_scan_completed_at is null or p_scan_completed_at < r.prepared_at
     or p_scan_completed_at > clock_timestamp()
     or row(p_storage_path,p_mime_type,p_size_bytes,p_sha256)
       is distinct from row(r.storage_path,r.mime_type,r.size_bytes,r.sha256)
     or (r.state='finalized' and row(p_scan_provider,p_scan_completed_at)
       is distinct from row(r.scan_provider,r.scan_completed_at)) then
    raise exception using errcode='DU412',message='document_upload_unverified';
  end if;
  select * into object from storage.objects
    where bucket_id = 'tenant-documents' and name=r.storage_path for share nowait;
  if not found or jsonb_typeof(object.metadata -> 'size') not in ('number','string')
     or (object.metadata ->> 'size') is distinct from r.size_bytes::text
     or (object.metadata ->> 'mimetype') is distinct from r.mime_type then
    raise exception using errcode='DU412',message='document_upload_unverified';
  end if;
  if r.state='finalized' then
    if head.id is distinct from r.document_id then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    return r.committed_receipt;
  end if;
  if r.state <> 'prepared' then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  if clock_timestamp() >= r.deadline_at then
    raise exception using errcode='DU410',message='document_upload_expired';
  end if;
  if head.current_version_id is distinct from r.expected_head
     or (head.id is not null and head.id is distinct from r.document_id) then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  finalized := clock_timestamp();
  if head.id is null then
    insert into public.documents(id,tenant_id,company_id,request_id,employee_id,doc_type,label)
    values (r.document_id,r.tenant_id,r.company_id,r.request_id,r.employee_id,r.doc_type,r.label);
  end if;
  insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,
    size_bytes,sha256,uploaded_by,created_at,upload_operation_id)
  values (r.reserved_version_id,r.document_id,r.tenant_id,r.storage_path,r.mime_type,
    r.size_bytes,r.sha256,r.actor_id,finalized,r.operation_id);
  update public.documents set current_version_id=r.reserved_version_id
    where id=r.document_id and tenant_id=r.tenant_id and company_id=r.company_id;
  if r.request_id is not null then
    update public.document_requests set status='fulfilled'
      where id=r.request_id and tenant_id=r.tenant_id and company_id=r.company_id and status='pending';
    if not found then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  end if;
  insert into public.document_lifecycle_audit(event,classification,actor_id,tenant_id,
    company_id,request_id,document_id,version_id,operation_id,sha256,occurred_at)
  values ('upload_finalized','success',r.actor_id,r.tenant_id,r.company_id,r.request_id,
    r.document_id,r.reserved_version_id,r.operation_id,r.sha256,finalized);
  receipt := jsonb_build_object('status','finalized','operationId',r.operation_id,
    'documentId',r.document_id,'versionId',r.reserved_version_id,'requestId',r.request_id,'finalizedAt',finalized);
  update public.document_upload_operations set state='finalized',scan_provider=p_scan_provider,
    scan_completed_at=p_scan_completed_at,finalized_at=finalized,committed_receipt=receipt
    where operation_id=r.operation_id and state='prepared';
  if not found then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  return receipt;
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end;
$$;

alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) owner to postgres;
revoke all on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) to service_role;

create or replace function public.get_document_upload_receipt(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations; head public.documents;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:' || p_operation_id::text,0));
  select * into r from public.document_upload_operations
    where operation_id=p_operation_id and actor_id=p_actor_id
      and tenant_id=p_tenant_id and company_id=p_company_id for update nowait;
  if not found or row(r.actor_id,r.tenant_id,r.company_id)
     is distinct from row(p_actor_id,p_tenant_id,p_company_id) then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,r.employee_id,r.request_id);
  head := public._document_upload_lock_resource(p_tenant_id,p_company_id,r.request_id,
    r.employee_id,r.doc_type,r.input_document_id,r.state='finalized');
  if r.state='finalized' then
    if head.id is distinct from r.document_id then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    return r.committed_receipt;
  end if;
  return jsonb_build_object('status',r.state,'operationId',r.operation_id);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end;
$$;

alter function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) to service_role;

commit;
