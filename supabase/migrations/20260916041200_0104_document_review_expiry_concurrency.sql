-- P3.07 — deterministic review decisions and optimistic expiry changes.
begin;

drop function public.review_document_version(uuid, uuid, uuid, text, text, timestamptz);
drop function public.set_pro_document_expiry(uuid, uuid, uuid, date);

revoke insert, update, delete, truncate, references, trigger
  on table public.document_versions
  from public, anon, authenticated, service_role;

create function public.review_document_version(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_company_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_expected_head_version_id uuid,
  p_expected_review_status text,
  p_status text,
  p_note text
) returns table (
  document_id uuid,
  company_id uuid,
  fulfilled_request_id uuid,
  review_status text,
  reviewed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_document public.documents%rowtype;
  v_version public.document_versions%rowtype;
  v_request public.document_requests%rowtype;
  v_trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_trimmed_note text;
  v_decided_at timestamptz;
  v_fulfilled_request_id uuid;
begin
  if p_tenant_id is null or p_actor_id is null or p_company_id is null
    or p_document_id is null or p_version_id is null
    or p_expected_head_version_id is null
    or p_expected_review_status is distinct from 'pending'
    or p_status is null or p_status not in ('approved', 'rejected') then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;

  v_trimmed_note := case when p_note is null then null else btrim(p_note, v_trim_characters) end;
  if (p_status = 'rejected' and coalesce(v_trimmed_note, '') = '')
    or char_length(coalesce(v_trimmed_note, '')) > 280 then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_actor_id]);

  perform 1 from public.tenants as tenant
    where tenant.id = p_tenant_id and tenant.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.profiles as actor
    where actor.id = p_actor_id and actor.role = 'pro' and actor.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.pro_company_assignments as assignment
    where assignment.tenant_id = p_tenant_id and assignment.company_id = p_company_id
      and assignment.pro_profile_id = p_actor_id and assignment.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.company_profiles as company
    where company.id = p_company_id and company.tenant_id = p_tenant_id for share;
  if not found then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  select document_row.* into v_document from public.documents as document_row
    where document_row.id = p_document_id and document_row.tenant_id = p_tenant_id
      and document_row.company_id = p_company_id
    for update;
  if not found then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;
  select version_row.* into v_version from public.document_versions as version_row
    where version_row.id = p_version_id and version_row.document_id = p_document_id
      and version_row.tenant_id = p_tenant_id
    for update;
  if not found then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  if v_document.current_version_id is distinct from p_expected_head_version_id
    or p_expected_head_version_id is distinct from p_version_id
    or v_version.review_status is distinct from p_expected_review_status then
    raise exception using errcode = 'MD409', message = 'document_review_conflict';
  end if;

  if v_document.request_id is not null then
    select request_row.* into v_request from public.document_requests as request_row
      where request_row.id = v_document.request_id and request_row.tenant_id = p_tenant_id
        and request_row.company_id = p_company_id for update;
    if not found then
      raise exception using errcode = 'MD404', message = 'document_version_not_found';
    end if;
  end if;

  v_decided_at := clock_timestamp();
  update public.document_versions as version_row
    set review_status = p_status,
        review_note = v_trimmed_note,
        reviewed_by = p_actor_id,
        reviewed_at = v_decided_at
    where version_row.id = p_version_id and version_row.document_id = p_document_id
      and version_row.tenant_id = p_tenant_id
      and version_row.review_status = p_expected_review_status;
  if not found then
    raise exception using errcode = 'MD409', message = 'document_review_conflict';
  end if;

  if p_status = 'approved' and v_document.request_id is not null then
    if v_request.status = 'pending' then
      update public.document_requests as request_row
        set status = 'fulfilled', updated_at = v_decided_at
        where request_row.id = v_request.id and request_row.tenant_id = p_tenant_id
          and request_row.company_id = p_company_id and request_row.status = 'pending';
      if not found then
        raise exception using errcode = 'MD409', message = 'document_review_conflict';
      end if;
      v_fulfilled_request_id := v_request.id;
    elsif v_request.status = 'fulfilled' then
      v_fulfilled_request_id := v_request.id;
    elsif v_request.status <> 'cancelled' then
      raise exception using errcode = 'MD409', message = 'document_review_conflict';
    end if;
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'updated', 'self_serve',
    jsonb_build_object(
      'entity', 'document', 'op', 'review', 'document_id', p_document_id,
      'version_id', p_version_id,
      'expected_head_version_id', p_expected_head_version_id,
      'previous_review_status', p_expected_review_status,
      'review_status', p_status, 'reviewed_at', v_decided_at,
      'fulfilled_request_id', v_fulfilled_request_id
    )
  );

  return query select p_document_id, p_company_id, v_fulfilled_request_id, p_status, v_decided_at;
end;
$function$;

alter function public.review_document_version(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text)
  owner to postgres;
revoke all on function public.review_document_version(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_document_version(uuid, uuid, uuid, uuid, uuid, uuid, text, text, text)
  to service_role;

create function public.set_pro_document_expiry(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_company_id uuid,
  p_document_id uuid,
  p_expected_head_version_id uuid,
  p_expected_expires_on date,
  p_expires_on date
) returns table (
  document_id uuid,
  company_id uuid,
  expires_on date
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_document public.documents%rowtype;
  v_employee public.employees%rowtype;
begin
  if p_tenant_id is null or p_actor_id is null or p_company_id is null
    or p_document_id is null or p_expected_head_version_id is null then
    raise exception using errcode = 'MD422', message = 'invalid_expiry';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_actor_id]);
  perform 1 from public.tenants as tenant
    where tenant.id = p_tenant_id and tenant.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.profiles as actor
    where actor.id = p_actor_id and actor.role = 'pro' and actor.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.pro_company_assignments as assignment
    where assignment.tenant_id = p_tenant_id and assignment.company_id = p_company_id
      and assignment.pro_profile_id = p_actor_id and assignment.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  perform 1 from public.company_profiles as company
    where company.id = p_company_id and company.tenant_id = p_tenant_id for share;
  if not found then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  select document_row.* into v_document from public.documents as document_row
    where document_row.id = p_document_id and document_row.tenant_id = p_tenant_id
      and document_row.company_id = p_company_id
    for update;
  if not found then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  if v_document.current_version_id is distinct from p_expected_head_version_id
    or v_document.expires_on is distinct from p_expected_expires_on then
    raise exception using errcode = 'MD409', message = 'document_expiry_conflict';
  end if;

  if v_document.employee_id is not null then
    select employee_row.* into v_employee from public.employees as employee_row
      where employee_row.id = v_document.employee_id and employee_row.tenant_id = p_tenant_id
        and employee_row.company_id = p_company_id for share;
    if not found then
      raise exception using errcode = 'MD404', message = 'document_not_found';
    end if;
  end if;
  if v_document.doc_type = 'trade_license'
    or (v_document.employee_id is not null and v_document.doc_type in ('visa', 'emirates_id')) then
    raise exception using errcode = 'MD409', message = 'expiry_externally_managed';
  end if;

  update public.documents as document_row
    set expires_on = p_expires_on
    where document_row.id = p_document_id and document_row.tenant_id = p_tenant_id
      and document_row.company_id = p_company_id
      and document_row.current_version_id = p_expected_head_version_id
      and document_row.expires_on is not distinct from p_expected_expires_on;
  if not found then
    raise exception using errcode = 'MD409', message = 'document_expiry_conflict';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id, p_actor_id, 'updated', 'self_serve',
    jsonb_build_object(
      'entity', 'document', 'op', 'set_expiry', 'document_id', p_document_id,
      'expected_head_version_id', p_expected_head_version_id,
      'previous_expires_on', p_expected_expires_on, 'expires_on', p_expires_on
    )
  );

  return query select p_document_id, p_company_id, p_expires_on;
end;
$function$;

alter function public.set_pro_document_expiry(uuid, uuid, uuid, uuid, uuid, date, date)
  owner to postgres;
revoke all on function public.set_pro_document_expiry(uuid, uuid, uuid, uuid, uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.set_pro_document_expiry(uuid, uuid, uuid, uuid, uuid, date, date)
  to service_role;

commit;
