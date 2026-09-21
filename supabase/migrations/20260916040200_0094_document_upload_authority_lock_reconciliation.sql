-- Forward-only correction: authority must be supported by live rows actually
-- locked in this transaction. Preserve the existing PRO seam's Dubai date rule.
begin;

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
      and expiry_date >= timezone('Asia/Dubai',pg_catalog.now())::date
    order by id for share;
    if not found then
      raise exception using errcode='DU403',message='document_upload_forbidden';
    end if;
    perform 1 from public.pro_company_assignments
    where pro_profile_id=p_actor_id and tenant_id=p_tenant_id and company_id=p_company_id
      and status='active' order by id for share;
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

alter function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid) owner to postgres;
revoke all on function public._document_upload_lock_authority(uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;

commit;
