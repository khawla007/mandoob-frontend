-- Abandoned reservations only. No retention policy, scheduler, or blob deletion.
-- SQL cannot roll back a provider's physical upload/delete: Task5 must prove that
-- boundary using real Storage SDK bytes and investigate physical orphan failures.
begin;
alter table public.document_upload_operations
  add column cleanup_fence uuid,
  add column cleanup_lease_until timestamptz,
  add column cleanup_authorized boolean not null default false,
  add column cleanup_hold boolean not null default false,
  add column cleanup_completed_at timestamptz,
  add constraint document_upload_cleanup_shape check (
    (state in ('prepared','finalized') and cleanup_fence is null
      and cleanup_lease_until is null and not cleanup_authorized and cleanup_completed_at is null)
    or (state='cleanup_pending' and cleanup_fence is not null
      and cleanup_lease_until is not null and cleanup_completed_at is null)
    or (state='cleaned' and cleanup_fence is not null
      and cleanup_lease_until is not null and cleanup_authorized and cleanup_completed_at is not null)
  );
-- Existing upload attribution stays intact. Cleanup events are truthful system
-- worker events, not claims that an inactive initiating uploader performed them.
alter table public.document_lifecycle_audit
  drop constraint document_lifecycle_audit_event_check,
  drop constraint document_lifecycle_audit_once,
  alter column actor_id drop not null,
  add column actor_kind text not null default 'uploader',
  add column cleanup_fence uuid,
  add constraint document_lifecycle_audit_event_check check (event in (
    'upload_finalized','upload_cleanup_claimed','upload_cleanup_authorized',
    'upload_cleanup_failed','upload_cleanup_completed','upload_cleanup_hold_changed')),
  add constraint document_lifecycle_audit_actor_kind check (
    (event='upload_finalized' and actor_kind='uploader' and actor_id is not null and cleanup_fence is null)
    or (event<>'upload_finalized' and actor_kind='system' and actor_id is null));
create unique index document_lifecycle_audit_finalized_once
  on public.document_lifecycle_audit(operation_id) where event='upload_finalized';

create or replace function public._document_upload_guard_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (to_jsonb(new) - array['state','scan_provider','scan_completed_at','finalized_at',
      'committed_receipt','cleanup_fence','cleanup_lease_until','cleanup_authorized',
      'cleanup_hold','cleanup_completed_at']) is distinct from
     (to_jsonb(old) - array['state','scan_provider','scan_completed_at','finalized_at',
      'committed_receipt','cleanup_fence','cleanup_lease_until','cleanup_authorized',
      'cleanup_hold','cleanup_completed_at'])
     or old.state='cleaned'
     or (old.cleanup_authorized and (not new.cleanup_authorized or new.cleanup_hold))
     or (old.state='finalized' and
       (to_jsonb(new)-'cleanup_hold') is distinct from (to_jsonb(old)-'cleanup_hold'))
     or (old.state='prepared' and new.state not in ('prepared','finalized','cleanup_pending'))
     or (old.state='cleanup_pending' and new.state not in ('cleanup_pending','cleaned'))
     or (old.state='cleanup_pending' and row(new.scan_provider,new.scan_completed_at,
       new.finalized_at,new.committed_receipt) is distinct from
       row(old.scan_provider,old.scan_completed_at,old.finalized_at,old.committed_receipt))
     or (new.cleanup_lease_until is distinct from old.cleanup_lease_until and
       (new.cleanup_lease_until <= clock_timestamp()
        or new.cleanup_lease_until > clock_timestamp()+interval '300 seconds')) then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  return new;
end; $$;

-- Shared operation -> resource lock order. No uploader authority dependency:
-- recovery is service-only and still checks immutable full firm/company scope.
create or replace function public._document_upload_cleanup_lock(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns public.document_upload_operations language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:'||p_operation_id::text,0));
  select * into r from public.document_upload_operations
    where operation_id=p_operation_id and tenant_id=p_tenant_id and company_id=p_company_id
    for update nowait;
  if not found then
    raise exception using errcode='DU403',message='document_upload_forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    jsonb_build_array('document-upload-resource',r.tenant_id,r.company_id,r.request_id,
      r.employee_id,r.doc_type)::text,0));
  perform 1 from public.company_profiles where id=r.company_id and tenant_id=r.tenant_id for share nowait;
  if not found then raise exception using errcode='DU403',message='document_upload_forbidden'; end if;
  if r.request_id is not null then
    perform 1 from public.document_requests where id=r.request_id and tenant_id=r.tenant_id
      and company_id=r.company_id for share nowait;
    if not found then raise exception using errcode='DU403',message='document_upload_forbidden'; end if;
  end if;
  perform 1 from public.documents where tenant_id=r.tenant_id and company_id=r.company_id
    and (id=r.document_id or (request_id is not distinct from r.request_id
      and employee_id is not distinct from r.employee_id and doc_type=r.doc_type))
    order by id for share nowait;
  return r;
end; $$;
create or replace function public._document_upload_cleanup_unreferenced(r public.document_upload_operations)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if r.state='finalized' or r.committed_receipt is not null or r.finalized_at is not null
     or r.cleanup_hold
     or exists(select 1 from public.document_versions where storage_path=r.storage_path
       or upload_operation_id=r.operation_id or id=r.reserved_version_id)
     or exists(select 1 from public.documents where current_version_id=r.reserved_version_id)
     or exists(select 1 from public.document_lifecycle_audit
       where operation_id=r.operation_id and event='upload_finalized') then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
end; $$;
create or replace function public._document_upload_cleanup_audit(
  r public.document_upload_operations,p_event text,p_classification text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.document_lifecycle_audit(event,classification,actor_id,actor_kind,
    tenant_id,company_id,request_id,document_id,version_id,operation_id,sha256,cleanup_fence)
  values(p_event,p_classification,null,'system',r.tenant_id,r.company_id,r.request_id,
    r.document_id,r.reserved_version_id,r.operation_id,r.sha256,r.cleanup_fence);
end; $$;
create or replace function public.reconcile_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  r:=public._document_upload_cleanup_lock(p_tenant_id,p_company_id,p_operation_id);
  if r.state='finalized' then return r.committed_receipt; end if;
  return jsonb_build_object('status',r.state,'operationId',r.operation_id);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create or replace function public.claim_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_lease_seconds integer default 300
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  if p_lease_seconds is null or p_lease_seconds not between 1 and 300 then
    raise exception using errcode='DU422',message='document_upload_invalid';
  end if;
  r:=public._document_upload_cleanup_lock(p_tenant_id,p_company_id,p_operation_id);
  -- Private terminal receipt checked before any claim/identity is issued.
  perform public._document_upload_cleanup_unreferenced(r);
  if r.state='cleaned' then raise exception using errcode='DU409',message='document_upload_conflict'; end if;
  if r.state='prepared' or clock_timestamp() >= r.cleanup_lease_until then
    update public.document_upload_operations set state='cleanup_pending',cleanup_fence=gen_random_uuid(),
      cleanup_lease_until=clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds)
      where operation_id=r.operation_id returning * into r;
    perform public._document_upload_cleanup_audit(r,'upload_cleanup_claimed','success');
  end if;
  return jsonb_build_object('status',r.state,'operationId',r.operation_id,'fence',r.cleanup_fence,
    'leaseUntil',r.cleanup_lease_until,'storageBucket','tenant-documents','storagePath',r.storage_path);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create or replace function public.authorize_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_fence uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  r:=public._document_upload_cleanup_lock(p_tenant_id,p_company_id,p_operation_id);
  perform public._document_upload_cleanup_unreferenced(r);
  if r.state<>'cleanup_pending' or r.cleanup_fence is distinct from p_fence
     or clock_timestamp() >= r.cleanup_lease_until then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  perform 1 from storage.objects where bucket_id='tenant-documents' and name=r.storage_path for share nowait;
  if not r.cleanup_authorized then
    update public.document_upload_operations set cleanup_authorized=true where operation_id=r.operation_id
      returning * into r;
    perform public._document_upload_cleanup_audit(r,'upload_cleanup_authorized','success');
  end if;
  -- Authorization is irreversible; a hold cannot race this provider delete window.
  return jsonb_build_object('status','delete_authorized','operationId',r.operation_id,'fence',r.cleanup_fence,
    'leaseUntil',r.cleanup_lease_until,'storageBucket','tenant-documents','storagePath',r.storage_path);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create or replace function public.complete_document_upload_cleanup(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_fence uuid,p_deleted boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  r:=public._document_upload_cleanup_lock(p_tenant_id,p_company_id,p_operation_id);
  perform public._document_upload_cleanup_unreferenced(r);
  if r.cleanup_fence is distinct from p_fence or clock_timestamp() >= r.cleanup_lease_until
     or not r.cleanup_authorized or r.state not in ('cleanup_pending','cleaned') then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  if r.state='cleaned' then
    if p_deleted is distinct from true then raise exception using errcode='DU409',message='document_upload_conflict'; end if;
    return jsonb_build_object('status','cleaned','operationId',r.operation_id);
  end if;
  if p_deleted is distinct from true then
    perform public._document_upload_cleanup_audit(r,'upload_cleanup_failed','failure');
    return jsonb_build_object('status','cleanup_pending','operationId',r.operation_id);
  end if;
  perform 1 from storage.objects where bucket_id='tenant-documents' and name=r.storage_path for share nowait;
  if found then raise exception using errcode='DU409',message='document_upload_conflict'; end if;
  update public.document_upload_operations set state='cleaned',cleanup_completed_at=clock_timestamp()
    where operation_id=r.operation_id returning * into r;
  perform public._document_upload_cleanup_audit(r,'upload_cleanup_completed','success');
  return jsonb_build_object('status','cleaned','operationId',r.operation_id);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create or replace function public.set_document_upload_cleanup_hold(
  p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,p_held boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  if p_held is null then raise exception using errcode='DU422',message='document_upload_invalid'; end if;
  r:=public._document_upload_cleanup_lock(p_tenant_id,p_company_id,p_operation_id);
  if r.cleanup_authorized or r.state='cleaned' then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  if r.cleanup_hold is distinct from p_held then
    update public.document_upload_operations set cleanup_hold=p_held where operation_id=r.operation_id
      returning * into r;
    perform public._document_upload_cleanup_audit(r,'upload_cleanup_hold_changed','success');
  end if;
  return jsonb_build_object('status',r.state,'operationId',r.operation_id,'held',r.cleanup_hold);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;

-- Any new insert (including unbound legacy writers) must serialize reservation
-- identity before binding it. Existing legacy paths/history are never rewritten.
create or replace function public._document_upload_cleanup_guard_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  select * into r from public.document_upload_operations where storage_path=new.storage_path;
  if found then
    r:=public._document_upload_cleanup_lock(r.tenant_id,r.company_id,r.operation_id);
    if r.state<>'prepared' or new.upload_operation_id is distinct from r.operation_id
       or clock_timestamp() >= r.deadline_at then
      raise exception using errcode='DU409',message='document_upload_conflict';
    end if;
  end if;
  return new;
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create trigger document_upload_cleanup_version_binding before insert on public.document_versions
for each row execute function public._document_upload_cleanup_guard_binding();

-- Preserve the immutable previously applied publication implementation, behind
-- a private delegate. Reject abandoned reservations before checking absent blobs
-- or fresh actor authority so cleanup can never resurrect publication.
alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  rename to _document_upload_finalize_before_cleanup;
revoke all on function public._document_upload_finalize_before_cleanup(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  from public, anon, authenticated, service_role;
create or replace function public.finalize_document_upload(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid,p_operation_id uuid,
  p_scan_state text,p_scan_provider text,p_scan_completed_at timestamptz,
  p_storage_path text,p_mime_type text,p_size_bytes bigint,p_sha256 text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-upload-operation:'||p_operation_id::text,0));
  select * into r from public.document_upload_operations where operation_id=p_operation_id
    and actor_id=p_actor_id and tenant_id=p_tenant_id and company_id=p_company_id for update nowait;
  if not found then raise exception using errcode='DU403',message='document_upload_forbidden'; end if;
  if r.state in ('cleanup_pending','cleaned') then
    raise exception using errcode='DU409',message='document_upload_conflict';
  end if;
  -- Expired writers are fenced before Storage insertion, so an expired upload
  -- may have no object metadata. Preserve DU410 after fresh actor/resource gates
  -- instead of requiring an object that the write fence now correctly prevents.
  if r.state='prepared' and clock_timestamp() >= r.deadline_at then
    perform public._document_upload_lock_authority(p_actor_id,p_tenant_id,p_company_id,r.employee_id,r.request_id);
    perform public._document_upload_lock_resource(p_tenant_id,p_company_id,r.request_id,
      r.employee_id,r.doc_type,r.input_document_id,false);
    raise exception using errcode='DU410',message='document_upload_expired';
  end if;
  return public._document_upload_finalize_before_cleanup(p_actor_id,p_tenant_id,p_company_id,p_operation_id,
    p_scan_state,p_scan_provider,p_scan_completed_at,p_storage_path,p_mime_type,p_size_bytes,p_sha256);
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
alter function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) owner to postgres;
revoke all on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_document_upload(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text,bigint,text) to service_role;

-- Only the new UUID tenant/company/documents/operation/object namespace. Older
-- document paths, PRO credentials, recordings and every other bucket stay intact.
-- Provider timestamp/bookkeeping updates are not object creation/content writes.
create or replace function public._document_upload_cleanup_guard_storage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.document_upload_operations; target text; targets text[];
begin
  if tg_op='UPDATE' and row(new.bucket_id,new.name,new.metadata,new.user_metadata,new.version)
    is not distinct from row(old.bucket_id,old.name,old.metadata,old.user_metadata,old.version) then
    return new;
  end if;
  targets:=array[case when new.bucket_id='tenant-documents' then new.name end];
  if tg_op='UPDATE' then targets:=targets||array[case when old.bucket_id='tenant-documents' then old.name end]; end if;
  foreach target in array targets loop
    if target ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|jpg|png|docx|xlsx)$' then
      if tg_op='UPDATE' and row(new.bucket_id,new.name) is distinct from row(old.bucket_id,old.name) then
        raise exception using errcode='DU409',message='document_upload_conflict';
      end if;
      -- NOWAIT row lock avoids inverse Storage-row -> operation-advisory waits.
      select * into r from public.document_upload_operations where storage_path=target for share nowait;
      if not found or r.state<>'prepared' or clock_timestamp() >= r.deadline_at then
        raise exception using errcode='DU409',message='document_upload_conflict';
      end if;
    end if;
  end loop;
  return new;
exception when lock_not_available then
  raise exception using errcode='DU409',message='document_upload_conflict';
end; $$;
create trigger document_upload_cleanup_storage_write before insert or update on storage.objects
for each row execute function public._document_upload_cleanup_guard_storage();

alter function public._document_upload_guard_operation() owner to postgres;
revoke all on function public._document_upload_guard_operation() from public, anon, authenticated, service_role;
alter function public._document_upload_cleanup_lock(uuid,uuid,uuid) owner to postgres;
revoke all on function public._document_upload_cleanup_lock(uuid,uuid,uuid) from public, anon, authenticated, service_role;
alter function public._document_upload_cleanup_unreferenced(public.document_upload_operations) owner to postgres;
revoke all on function public._document_upload_cleanup_unreferenced(public.document_upload_operations) from public, anon, authenticated, service_role;
alter function public._document_upload_cleanup_audit(public.document_upload_operations,text,text) owner to postgres;
revoke all on function public._document_upload_cleanup_audit(public.document_upload_operations,text,text) from public, anon, authenticated, service_role;
alter function public._document_upload_cleanup_guard_binding() owner to postgres;
revoke all on function public._document_upload_cleanup_guard_binding() from public, anon, authenticated, service_role;
alter function public._document_upload_cleanup_guard_storage() owner to postgres;
revoke all on function public._document_upload_cleanup_guard_storage() from public, anon, authenticated, service_role;
alter function public.reconcile_document_upload_cleanup(uuid,uuid,uuid) owner to postgres;
revoke all on function public.reconcile_document_upload_cleanup(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_document_upload_cleanup(uuid,uuid,uuid) to service_role;
alter function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer) owner to postgres;
revoke all on function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_document_upload_cleanup(uuid,uuid,uuid,integer) to service_role;
alter function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.authorize_document_upload_cleanup(uuid,uuid,uuid,uuid) to service_role;
alter function public.complete_document_upload_cleanup(uuid,uuid,uuid,uuid,boolean) owner to postgres;
revoke all on function public.complete_document_upload_cleanup(uuid,uuid,uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.complete_document_upload_cleanup(uuid,uuid,uuid,uuid,boolean) to service_role;
alter function public.set_document_upload_cleanup_hold(uuid,uuid,uuid,boolean) owner to postgres;
revoke all on function public.set_document_upload_cleanup_hold(uuid,uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_document_upload_cleanup_hold(uuid,uuid,uuid,boolean) to service_role;
commit;
