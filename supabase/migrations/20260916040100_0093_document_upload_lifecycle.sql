-- Durable reservations are private server state, not published document heads.
-- Scan/object parameters are trusted server attestations; actual byte hashing is
-- a separate server coordinator obligation. SQL independently checks Storage identity.
begin;

create table public.document_upload_operations (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  tenant_id uuid not null,
  company_id uuid not null,
  request_id uuid,
  input_document_id uuid,
  document_id uuid not null,
  employee_id uuid,
  doc_type text not null check (doc_type in (
    'passport','visa','emirates_id','trade_license','ejari','moa','shareholder_id',
    'other','aoa','bank_reference_letter','noc','cv_resume','office_lease',
    'medical_certificate','insurance_policy'
  )),
  label text check (char_length(label) <= 200 and label !~ '[[:cntrl:]]'),
  expected_head uuid,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  object_id uuid not null unique,
  reserved_version_id uuid not null unique,
  storage_path text not null unique,
  mime_type text not null,
  extension text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  safe_filename text not null check (
    char_length(safe_filename) between 1 and 255
    and safe_filename ~ '^[A-Za-z0-9_. -]+$'
    and safe_filename !~ '[.][.]'
  ),
  prepared_at timestamptz not null default clock_timestamp(),
  deadline_at timestamptz not null,
  state text not null default 'prepared'
    check (state in ('prepared','finalized','cleanup_pending','cleaned')),
  scan_provider text,
  scan_completed_at timestamptz,
  finalized_at timestamptz,
  committed_receipt jsonb,
  constraint document_upload_company_fk foreign key (tenant_id,company_id)
    references public.company_profiles(tenant_id,id) on delete restrict,
  constraint document_upload_request_fk foreign key (tenant_id,company_id,request_id)
    references public.document_requests(tenant_id,company_id,id) on delete restrict,
  constraint document_upload_employee_fk foreign key (tenant_id,company_id,employee_id)
    references public.employees(tenant_id,company_id,id) on delete restrict,
  constraint document_upload_version_identity unique
    (operation_id,tenant_id,document_id,reserved_version_id),
  constraint document_upload_media_agreement check (
    (mime_type='application/pdf' and extension='pdf')
    or (mime_type='image/jpeg' and extension='jpg')
    or (mime_type='image/png' and extension='png')
    or (mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' and extension='docx')
    or (mime_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and extension='xlsx')
  ),
  constraint document_upload_path_identity check (
    storage_path = tenant_id::text || '/' || company_id::text || '/documents/'
      || operation_id::text || '/' || object_id::text || '.' || extension
  ),
  constraint document_upload_deadline_bounded check (
    deadline_at = prepared_at + interval '15 minutes'
  ),
  constraint document_upload_receipt_shape check (
    (state <> 'finalized' and committed_receipt is null and finalized_at is null
      and scan_provider is null and scan_completed_at is null)
    or (state = 'finalized' and committed_receipt is not null and finalized_at is not null
      and scan_provider = 'clamav' and scan_completed_at >= prepared_at
      and scan_completed_at <= finalized_at)
  )
);
alter table public.document_upload_operations enable row level security;
revoke all on table public.document_upload_operations from public, anon, authenticated, service_role;

-- Deliberately no parent FKs: audit identifiers are immutable historical snapshots.
-- No cascades, arbitrary metadata, filename, object path, bearer, or provider error.
create table public.document_lifecycle_audit (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('upload_finalized')),
  classification text not null check (classification in ('success','failure')),
  actor_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  request_id uuid,
  document_id uuid not null,
  version_id uuid not null,
  operation_id uuid not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  constraint document_lifecycle_audit_once unique (operation_id,event)
);
alter table public.document_lifecycle_audit enable row level security;
revoke all on table public.document_lifecycle_audit from public, anon, authenticated, service_role;

alter table public.document_versions add column upload_operation_id uuid;
alter table public.document_versions add constraint document_versions_upload_operation_fk
  foreign key (upload_operation_id,tenant_id,document_id,id)
  references public.document_upload_operations
    (operation_id,tenant_id,document_id,reserved_version_id) on delete restrict;

create or replace function public._document_upload_deny_history_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode='DU409',message='document_upload_conflict';
end;
$$;
create trigger document_lifecycle_audit_immutable
before update or delete on public.document_lifecycle_audit
for each row execute function public._document_upload_deny_history_mutation();
create trigger document_lifecycle_audit_no_truncate
before truncate on public.document_lifecycle_audit
for each statement execute function public._document_upload_deny_history_mutation();
create trigger document_upload_operations_no_delete
before delete on public.document_upload_operations
for each row execute function public._document_upload_deny_history_mutation();
create trigger document_upload_operations_no_truncate
before truncate on public.document_upload_operations
for each statement execute function public._document_upload_deny_history_mutation();
create trigger document_versions_no_truncate
before truncate on public.document_versions
for each statement execute function public._document_upload_deny_history_mutation();
revoke delete, truncate on public.document_versions from public, anon, authenticated, service_role;

create or replace function public._document_upload_guard_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new) - array['state','scan_provider','scan_completed_at','finalized_at','committed_receipt'])
     is distinct from
     (to_jsonb(old) - array['state','scan_provider','scan_completed_at','finalized_at','committed_receipt'])
     or old.state <> 'prepared' or new.state <> 'finalized' then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  return new;
end;
$$;
create trigger document_upload_operations_immutable
before update on public.document_upload_operations
for each row execute function public._document_upload_guard_operation();

-- SECURITY INVOKER preserves current_user for direct-write fencing. Review RPCs
-- may alter only review fields; legacy versions remain unbound, never inferred clean.
create or replace function public._document_upload_guard_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare r public.document_upload_operations;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='DU409',message='document_upload_conflict';
  elsif tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['review_status','review_note','reviewed_by','reviewed_at'])
       is distinct from
       (to_jsonb(old) - array['review_status','review_note','reviewed_by','reviewed_at']) then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  elsif new.upload_operation_id is not null then
    if current_user <> 'postgres' then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    select * into r from public.document_upload_operations
    where operation_id=new.upload_operation_id;
    if not found or r.state <> 'prepared'
       or row(new.id,new.document_id,new.tenant_id,new.storage_path,new.mime_type,
         new.size_bytes,new.sha256,new.uploaded_by)
         is distinct from row(r.reserved_version_id,r.document_id,r.tenant_id,
           r.storage_path,r.mime_type,r.size_bytes,r.sha256,r.actor_id) then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  end if;
  return new;
end;
$$;
create trigger document_versions_immutable
before update or delete on public.document_versions
for each row execute function public._document_upload_guard_version();
create trigger document_versions_upload_binding
before insert on public.document_versions
for each row execute function public._document_upload_guard_version();

create or replace function public._document_upload_guard_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(new.id,new.tenant_id,new.company_id,new.request_id,new.employee_id,
       new.doc_type,new.created_at)
       is distinct from row(old.id,old.tenant_id,old.company_id,old.request_id,
         old.employee_id,old.doc_type,old.created_at)
     and exists (select 1 from public.document_versions where document_id=old.id) then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  return new;
end;
$$;
create trigger document_upload_documents_immutable
before update on public.documents
for each row execute function public._document_upload_guard_document();

-- Shared lock order for every lifecycle entry: operation advisory lock, tenant,
-- active profile, live PRO credential/assignment or customer link, company,
-- employee, logical-resource advisory lock, request, document head. Row locks
-- prevent authority/resource revocation from interleaving publication.
create or replace function public._document_upload_lock_authority(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_employee_id uuid,p_request_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare actor public.profiles;
begin
  perform 1 from public.tenants where id=p_tenant_id and status='active' for share;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  select * into actor from public.profiles where id=p_actor_id and status='active' for share;
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
      and expiry_date >= timezone('Asia/Dubai',clock_timestamp())::date
    order by id for share;
    perform 1 from public.pro_company_assignments
    where pro_profile_id=p_actor_id and tenant_id=p_tenant_id and company_id=p_company_id
      and status='active' order by id for share;
    if not public.authorize_pro_company_access(p_actor_id, p_tenant_id, p_company_id) then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  elsif actor.role='customer' then
    if actor.tenant_id is distinct from p_tenant_id then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    perform 1 from public.customer_profiles
    where profile_id=p_actor_id and linked_company_id=p_company_id for share;
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
  perform 1 from public.company_profiles where id=p_company_id and tenant_id=p_tenant_id for share;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  if p_employee_id is not null then
    perform 1 from public.employees where id=p_employee_id and tenant_id=p_tenant_id
      and company_id=p_company_id
      and (actor.role <> 'employee' or (profile_id=p_actor_id and status='active')) for share;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
  end if;
end;
$$;

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
    select * into request from public.document_requests where id=p_request_id for update;
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
    order by id for update loop
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
  select * into r from public.document_upload_operations where operation_id=p_operation_id for update;
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
end;
$$;

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
  select * into r from public.document_upload_operations where operation_id=p_operation_id for update;
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
    where bucket_id = 'tenant-documents' and name=r.storage_path for share;
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
end;
$$;

create or replace function public.get_document_upload_receipt(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations; head public.documents;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:' || p_operation_id::text,0));
  select * into r from public.document_upload_operations where operation_id=p_operation_id for update;
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
end;
$$;

alter function public._document_upload_deny_history_mutation() owner to postgres;
alter function public._document_upload_guard_operation() owner to postgres;
alter function public._document_upload_guard_version() owner to postgres;
alter function public._document_upload_guard_document() owner to postgres;
alter function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid) owner to postgres;
alter function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean) owner to postgres;
revoke all on function public._document_upload_deny_history_mutation() from public, anon, authenticated, service_role;
revoke all on function public._document_upload_guard_operation() from public, anon, authenticated, service_role;
revoke all on function public._document_upload_guard_version() from public, anon, authenticated, service_role;
revoke all on function public._document_upload_guard_document() from public, anon, authenticated, service_role;
revoke all on function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public._document_upload_lock_resource(uuid,uuid,uuid,uuid,text,uuid,boolean) from public, anon, authenticated, service_role;

alter function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) owner to postgres;
alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) owner to postgres;
alter function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_document_upload(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,text,bigint,text,text) to service_role;
grant execute on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) to service_role;
grant execute on function public.get_document_upload_receipt(uuid,uuid,uuid,uuid) to service_role;

commit;
