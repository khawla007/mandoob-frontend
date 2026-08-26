-- Enforce the one-PRO/one-company assignment lifecycle and authorize PRO access
-- from the live assignment ledger rather than cached JWT tenant metadata.
begin;

alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('active', 'suspended', 'pending', 'unassigned'));

alter table public.pro_company_assignments
  drop constraint assignment_release_shape;
alter table public.pro_company_assignments
  add constraint assignment_release_shape check (
    (
      status = 'active'
      and released_at is null
      and released_by is null
      and release_reason is null
    )
    or
    (
      status = 'released'
      and released_at is not null
      and released_by is not null
      and release_reason is not null
      and char_length(trim(release_reason)) between 3 and 500
    )
  );

-- Every row carrying both tenant and company ownership must prove that the two
-- identifiers describe the same workspace. Child chains repeat tenant/company
-- ownership so a valid parent UUID from another workspace cannot be attached.
create unique index if not exists company_profiles_tenant_id_id_key
  on public.company_profiles (tenant_id, id);
create unique index if not exists employees_tenant_company_id_key
  on public.employees (tenant_id, company_id, id);
create unique index if not exists profiles_tenant_id_id_key
  on public.profiles (tenant_id, id);
create unique index if not exists customer_profiles_company_profile_key
  on public.customer_profiles (linked_company_id, profile_id);
create unique index if not exists document_requests_tenant_company_id_key
  on public.document_requests (tenant_id, company_id, id);
create unique index if not exists documents_tenant_company_id_key
  on public.documents (tenant_id, company_id, id);
create unique index if not exists documents_tenant_id_id_key
  on public.documents (tenant_id, id);
create unique index if not exists document_versions_tenant_document_id_key
  on public.document_versions (tenant_id, document_id, id);
create unique index if not exists meetings_tenant_id_id_key
  on public.meetings (tenant_id, id);
create unique index if not exists invoices_tenant_id_id_key
  on public.invoices (tenant_id, id);
create unique index if not exists payments_tenant_id_id_key
  on public.payments (tenant_id, id);

alter table public.employees
  add constraint employees_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.document_requests
  add constraint document_requests_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.documents
  add constraint documents_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.renewals
  add constraint renewals_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.invoices
  add constraint invoices_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.meetings
  add constraint meetings_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.bulk_import_jobs
  add constraint bulk_import_jobs_company_tenant_fk
  foreign key (tenant_id, company_id)
  references public.company_profiles (tenant_id, id)
  on delete cascade;
alter table public.employees
  add constraint employees_profile_tenant_fk
  foreign key (tenant_id, profile_id)
  references public.profiles (tenant_id, id)
  on delete set null (profile_id);
alter table public.invoices
  add constraint invoices_customer_company_fk
  foreign key (company_id, customer_profile_id)
  references public.customer_profiles (linked_company_id, profile_id)
  on delete set null (customer_profile_id);
alter table public.meetings
  add constraint meetings_customer_company_fk
  foreign key (company_id, customer_profile_id)
  references public.customer_profiles (linked_company_id, profile_id)
  on delete set null (customer_profile_id);

alter table public.documents
  add constraint documents_request_ownership_fk
  foreign key (tenant_id, company_id, request_id)
  references public.document_requests (tenant_id, company_id, id)
  on delete set null (request_id);
alter table public.document_requests
  add constraint document_requests_employee_ownership_fk
  foreign key (tenant_id, company_id, employee_id)
  references public.employees (tenant_id, company_id, id)
  on delete set null (employee_id);
alter table public.documents
  add constraint documents_employee_ownership_fk
  foreign key (tenant_id, company_id, employee_id)
  references public.employees (tenant_id, company_id, id)
  on delete set null (employee_id);
alter table public.renewals
  add constraint renewals_employee_ownership_fk
  foreign key (tenant_id, company_id, employee_id)
  references public.employees (tenant_id, company_id, id)
  on delete set null (employee_id);
alter table public.document_versions
  add constraint document_versions_document_tenant_fk
  foreign key (tenant_id, document_id)
  references public.documents (tenant_id, id)
  on delete cascade;
alter table public.documents
  add constraint documents_current_version_ownership_fk
  foreign key (tenant_id, id, current_version_id)
  references public.document_versions (tenant_id, document_id, id)
  on delete set null (current_version_id)
  deferrable initially deferred;
alter table public.meeting_ai_summaries
  add constraint meeting_ai_summaries_meeting_tenant_fk
  foreign key (tenant_id, meeting_id)
  references public.meetings (tenant_id, id)
  on delete cascade;

alter table public.payments drop constraint if exists payments_invoice_tenant_fk;
alter table public.payments
  add constraint payments_invoice_tenant_fk
  foreign key (tenant_id, invoice_id)
  references public.invoices (tenant_id, id)
  on delete cascade;
alter table public.refunds drop constraint if exists refunds_payment_tenant_fk;
alter table public.refunds
  add constraint refunds_payment_tenant_fk
  foreign key (tenant_id, payment_id)
  references public.payments (tenant_id, id)
  on delete cascade;

alter table public.tenant_audit_log
  drop constraint if exists tenant_audit_log_action_check;
alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in (
    'created',
    'approved',
    'rejected',
    'suspended',
    'reactivated',
    'updated',
    'completed',
    'cancelled',
    'unlocked',
    'session_revoked',
    'invoice_created',
    'invoice_voided',
    'invoice_marked_paid',
    'payment_initiated',
    'payment_succeeded',
    'payment_failed',
    'refund_issued',
    'infected_blocked',
    'reconciled',
    'comms_skipped_opted_out',
    'lead_created',
    'lead_assigned',
    'lead_stage_changed',
    'lead_note_added',
    'erasure_requested',
    'erasure_verified',
    'erasure_approved',
    'erasure_rejected',
    'erasure_completed',
    'bulk_imported',
    'meeting_slot_created',
    'meeting_scheduled',
    'meeting_cancelled',
    'meeting_completed',
    'meeting_recording_attached',
    'whatsapp_template_status_updated',
    'service_case_created',
    'service_case_updated',
    'company_pro_assigned',
    'company_pro_released'
  ));

create or replace function public.has_company_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and (
        p.role in ('admin', 'super_admin')
        or (p.role in ('customer', 'employee') and p.tenant_id = p_tenant_id)
        or (
          p.role = 'pro'
          and exists (
            select 1
            from public.pro_company_assignments a
            where a.pro_profile_id = p.id
              and a.tenant_id = p_tenant_id
              and a.status = 'active'
          )
        )
      )
  );
$$;

revoke all on function public.has_company_access(uuid)
  from public, anon, authenticated;
grant execute on function public.has_company_access(uuid)
  to authenticated, service_role;

create or replace function public.has_company_storage_access(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((storage.foldername(p_object_name))[1], '')
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_company_access(((storage.foldername(p_object_name))[1])::uuid)
    else false
  end;
$$;

revoke all on function public.has_company_storage_access(text)
  from public, anon, authenticated;
grant execute on function public.has_company_storage_access(text)
  to authenticated, service_role;

create or replace function public.lock_company_assignment_resources(
  p_company_id uuid,
  p_pro_profile_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock_namespace integer;
  v_lock_key integer;
begin
  -- The first advisory key separates company and PRO namespaces. Sorting the
  -- exact two-key lock identity prevents collision-driven lock-order inversion;
  -- a hash collision can therefore only serialize unrelated same-kind rows.
  for v_lock_namespace, v_lock_key in
    select requested.lock_namespace, requested.lock_key
    from (
      select 61001 as lock_namespace, pg_catalog.hashtext(p_company_id::text) as lock_key
      union
      select 61002, pg_catalog.hashtext(pro_id::text)
      from unnest(coalesce(p_pro_profile_ids, array[]::uuid[])) as pro_id
      where pro_id is not null
    ) as requested
    order by requested.lock_namespace, requested.lock_key
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_lock_namespace, v_lock_key);
  end loop;
end;
$$;

revoke all on function public.lock_company_assignment_resources(uuid, uuid[])
  from public, anon, authenticated;

create or replace function public.assign_pro_to_company(
  p_company_id uuid,
  p_pro_profile_id uuid,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_assignment_id uuid;
begin
  perform 1
  from public.profiles
  where id = p_actor_profile_id
    and role in ('admin', 'super_admin')
    and status = 'active'
    and tenant_id is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform public.lock_company_assignment_resources(
    p_company_id,
    array[p_pro_profile_id]
  );

  select tenant_id, status
    into v_tenant_id, v_company_status
  from public.company_profiles
  where id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;

  select status
    into v_tenant_status
  from public.tenants
  where id = v_tenant_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;
  if v_tenant_status = 'suspended'
     or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;
  if v_tenant_status not in ('pending', 'unassigned', 'active') then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;

  perform 1
  from public.profiles
  where id = p_pro_profile_id
    and role = 'pro'
    and status = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PRO_INACTIVE';
  end if;

  perform 1
  from public.pro_profiles
  where profile_id = p_pro_profile_id
    and credentials_verified = true
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PRO_NOT_VERIFIED';
  end if;

  perform 1
  from public.pro_company_assignments
  where pro_profile_id = p_pro_profile_id
    and status = 'active'
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED';
  end if;

  perform 1
  from public.pro_company_assignments
  where company_id = p_company_id
    and status = 'active'
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'COMPANY_ALREADY_ASSIGNED';
  end if;

  insert into public.pro_company_assignments (
    tenant_id,
    company_id,
    pro_profile_id,
    assigned_by
  ) values (
    v_tenant_id,
    p_company_id,
    p_pro_profile_id,
    p_actor_profile_id
  )
  returning id into v_assignment_id;

  update public.profiles
     set tenant_id = v_tenant_id,
         updated_at = now()
   where id = p_pro_profile_id;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('tenant_id', v_tenant_id),
         updated_at = now()
   where id = p_pro_profile_id;

  update public.tenants
     set status = 'active',
         updated_at = now()
   where id = v_tenant_id;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    v_tenant_id,
    p_actor_profile_id,
    'company_pro_assigned',
    'admin',
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'company_id', p_company_id,
      'pro_profile_id', p_pro_profile_id
    )
  );

  return v_assignment_id;
end;
$$;

create or replace function public.release_company_pro(
  p_company_id uuid,
  p_expected_assignment_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_tenant_id uuid;
  v_pro_profile_id uuid;
  v_lock_pro_profile_id uuid;
  v_reason text;
begin
  v_reason := btrim(p_reason);
  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_RELEASE_REASON';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_profile_id
    and role in ('admin', 'super_admin')
    and status = 'active'
    and tenant_id is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[]::uuid[]);
  select pro_profile_id
    into v_lock_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id
    and status = 'active';
  perform public.lock_company_assignment_resources(
    p_company_id,
    array[v_lock_pro_profile_id]
  );

  perform 1
  from public.company_profiles
  where id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  select id, tenant_id, pro_profile_id
    into v_assignment_id, v_tenant_id, v_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id
    and status = 'active'
  for update;
  if not found then
    if exists (
      select 1
      from public.pro_company_assignments
      where company_id = p_company_id
    ) then
      raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
    end if;
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_assignment_id <> p_expected_assignment_id then
    raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
  end if;

  perform 1
  from public.profiles
  where id = v_pro_profile_id
  for update;

  update public.pro_company_assignments
     set status = 'released',
         released_at = now(),
         released_by = p_actor_profile_id,
         release_reason = v_reason,
         updated_at = now()
   where id = v_assignment_id;

  update public.profiles
     set tenant_id = null,
         updated_at = now()
   where id = v_pro_profile_id;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'tenant_id',
         updated_at = now()
   where id = v_pro_profile_id;

  update public.tenants
     set status = 'unassigned',
         updated_at = now()
   where id = v_tenant_id
     and status = 'active';

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    v_tenant_id,
    p_actor_profile_id,
    'company_pro_released',
    'admin',
    jsonb_build_object(
      'assignment_id', v_assignment_id,
      'company_id', p_company_id,
      'pro_profile_id', v_pro_profile_id,
      'reason', v_reason
    )
  );

  return v_assignment_id;
end;
$$;

create or replace function public.reassign_company_pro(
  p_company_id uuid,
  p_expected_assignment_id uuid,
  p_replacement_pro_profile_id uuid,
  p_reason text,
  p_actor_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_assignment_id uuid;
  v_tenant_id uuid;
  v_tenant_status text;
  v_company_status public.company_status;
  v_old_pro_profile_id uuid;
  v_lock_old_pro_profile_id uuid;
  v_new_assignment_id uuid;
  v_reason text;
begin
  v_reason := btrim(p_reason);
  if v_reason is null or char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_RELEASE_REASON';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_profile_id
    and role in ('admin', 'super_admin')
    and status = 'active'
    and tenant_id is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[]::uuid[]);
  select pro_profile_id
    into v_lock_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id
    and status = 'active';
  perform public.lock_company_assignment_resources(
    p_company_id,
    array[v_lock_old_pro_profile_id, p_replacement_pro_profile_id]
  );

  select tenant_id, status
    into v_tenant_id, v_company_status
  from public.company_profiles
  where id = p_company_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;

  select status
    into v_tenant_status
  from public.tenants
  where id = v_tenant_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_READY';
  end if;
  if v_tenant_status = 'suspended'
     or v_company_status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;

  select id, pro_profile_id
    into v_old_assignment_id, v_old_pro_profile_id
  from public.pro_company_assignments
  where company_id = p_company_id
    and status = 'active'
  for update;
  if not found then
    if exists (
      select 1
      from public.pro_company_assignments
      where company_id = p_company_id
    ) then
      raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
    end if;
    raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
  end if;
  if v_old_assignment_id <> p_expected_assignment_id then
    raise exception using errcode = 'P0001', message = 'STALE_ASSIGNMENT';
  end if;
  if v_old_pro_profile_id = p_replacement_pro_profile_id then
    raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED';
  end if;

  -- All affected PRO profile rows use the same UUID order in every reassignment.
  perform 1
  from public.profiles
  where id in (v_old_pro_profile_id, p_replacement_pro_profile_id)
  order by id
  for update;

  perform 1
  from public.profiles
  where id = p_replacement_pro_profile_id
    and role = 'pro'
    and status = 'active';
  if not found then
    raise exception using errcode = 'P0001', message = 'PRO_INACTIVE';
  end if;

  perform 1
  from public.pro_profiles
  where profile_id = p_replacement_pro_profile_id
    and credentials_verified = true
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'PRO_NOT_VERIFIED';
  end if;

  perform 1
  from public.pro_company_assignments
  where pro_profile_id = p_replacement_pro_profile_id
    and status = 'active'
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'PRO_ALREADY_ASSIGNED';
  end if;

  update public.pro_company_assignments
     set status = 'released',
         released_at = now(),
         released_by = p_actor_profile_id,
         release_reason = v_reason,
         updated_at = now()
   where id = v_old_assignment_id;

  update public.profiles
     set tenant_id = null,
         updated_at = now()
   where id = v_old_pro_profile_id;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'tenant_id',
         updated_at = now()
   where id = v_old_pro_profile_id;

  insert into public.pro_company_assignments (
    tenant_id,
    company_id,
    pro_profile_id,
    assigned_by
  ) values (
    v_tenant_id,
    p_company_id,
    p_replacement_pro_profile_id,
    p_actor_profile_id
  )
  returning id into v_new_assignment_id;

  update public.profiles
     set tenant_id = v_tenant_id,
         updated_at = now()
   where id = p_replacement_pro_profile_id;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || jsonb_build_object('tenant_id', v_tenant_id),
         updated_at = now()
   where id = p_replacement_pro_profile_id;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values
    (
      v_tenant_id,
      p_actor_profile_id,
      'company_pro_released',
      'admin',
      jsonb_build_object(
        'assignment_id', v_old_assignment_id,
        'company_id', p_company_id,
        'pro_profile_id', v_old_pro_profile_id,
        'reason', v_reason,
        'replacement_assignment_id', v_new_assignment_id
      )
    ),
    (
      v_tenant_id,
      p_actor_profile_id,
      'company_pro_assigned',
      'admin',
      jsonb_build_object(
        'assignment_id', v_new_assignment_id,
        'company_id', p_company_id,
        'pro_profile_id', p_replacement_pro_profile_id,
        'replaces_assignment_id', v_old_assignment_id
      )
    );

  return v_new_assignment_id;
end;
$$;

revoke all on function public.assign_pro_to_company(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_company_pro(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_pro_to_company(uuid, uuid, uuid)
  to service_role;
grant execute on function public.release_company_pro(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.reassign_company_pro(uuid, uuid, uuid, text, uuid)
  to service_role;

-- Core company-owned records. Workspace access is live; mutations keep their
-- narrower role gates and employee/customer reads keep ownership checks.
drop policy if exists company_profiles_tenant_rw on public.company_profiles;
drop policy if exists company_profiles_super_admin_read on public.company_profiles;
drop policy if exists company_profiles_admin_read on public.company_profiles;
create policy company_profiles_workspace_read on public.company_profiles for select
  using (public.has_company_access(tenant_id));
create policy company_profiles_pro_write on public.company_profiles for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists employees_tenant_read on public.employees;
drop policy if exists employees_tenant_write on public.employees;
drop policy if exists employees_admin_read on public.employees;
drop policy if exists employees_self_read on public.employees;
create policy employees_workspace_read on public.employees for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'employee' and p.status = 'active'
    )
  );
create policy employees_self_read on public.employees for select
  using (public.has_company_access(tenant_id) and profile_id = auth.uid());
create policy employees_pro_write on public.employees for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists document_requests_super_admin_read on public.document_requests;
drop policy if exists document_requests_admin_read on public.document_requests;
drop policy if exists document_requests_tenant_read on public.document_requests;
drop policy if exists document_requests_pro_write on public.document_requests;
drop policy if exists document_requests_employee_self_read on public.document_requests;
create policy document_requests_workspace_read on public.document_requests for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'employee' and p.status = 'active'
    )
  );
create policy document_requests_employee_self_read on public.document_requests for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.employees e
      where e.id = document_requests.employee_id
        and e.tenant_id = document_requests.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );
create policy document_requests_pro_write on public.document_requests for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists documents_super_admin_read on public.documents;
drop policy if exists documents_admin_read on public.documents;
drop policy if exists documents_tenant_read on public.documents;
drop policy if exists documents_tenant_write on public.documents;
drop policy if exists documents_employee_self_read on public.documents;
create policy documents_workspace_read on public.documents for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'employee' and p.status = 'active'
    )
  );
create policy documents_employee_self_read on public.documents for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.employees e
      where e.id = documents.employee_id
        and e.tenant_id = documents.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );
create policy documents_member_write on public.documents for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  );

drop policy if exists document_versions_super_admin_read on public.document_versions;
drop policy if exists document_versions_admin_read on public.document_versions;
drop policy if exists document_versions_tenant_read on public.document_versions;
drop policy if exists document_versions_tenant_insert on public.document_versions;
drop policy if exists document_versions_pro_review on public.document_versions;
drop policy if exists document_versions_employee_self_read on public.document_versions;
create policy document_versions_workspace_read on public.document_versions for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'employee' and p.status = 'active'
    )
  );
create policy document_versions_employee_self_read on public.document_versions for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.documents d
      join public.employees e on e.id = d.employee_id
      where d.id = document_versions.document_id
        and d.tenant_id = document_versions.tenant_id
        and e.tenant_id = document_versions.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );
create policy document_versions_member_insert on public.document_versions for insert
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  );
create policy document_versions_pro_review on public.document_versions for update
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists renewals_super_admin_read on public.renewals;
drop policy if exists renewals_admin_read on public.renewals;
drop policy if exists renewals_tenant_read on public.renewals;
drop policy if exists renewals_pro_write on public.renewals;
drop policy if exists renewals_employee_self_read on public.renewals;
create policy renewals_workspace_read on public.renewals for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role <> 'employee' and p.status = 'active'
    )
  );
create policy renewals_employee_self_read on public.renewals for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.employees e
      where e.id = renewals.employee_id
        and e.tenant_id = renewals.tenant_id
        and e.profile_id = auth.uid()
        and e.status = 'active'
    )
  );
create policy renewals_pro_write on public.renewals for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists invoices_super_admin_read on public.invoices;
drop policy if exists invoices_pro_rw on public.invoices;
drop policy if exists invoices_customer_read on public.invoices;
create policy invoices_workspace_manage on public.invoices for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
create policy invoices_platform_read on public.invoices for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy invoices_customer_read on public.invoices for select
  using (
    public.has_company_access(tenant_id)
    and customer_profile_id = auth.uid()
    and exists (
      select 1 from public.customer_profiles cp
      where cp.profile_id = auth.uid()
        and cp.linked_company_id = invoices.company_id
    )
  );

drop policy if exists payments_super_admin_read on public.payments;
drop policy if exists payments_pro_rw on public.payments;
drop policy if exists payments_customer_read on public.payments;
create policy payments_workspace_manage on public.payments for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
create policy payments_platform_read on public.payments for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy payments_customer_read on public.payments for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.invoices i
      where i.id = payments.invoice_id
        and i.tenant_id = payments.tenant_id
        and i.customer_profile_id = auth.uid()
    )
  );

drop policy if exists refunds_super_admin_read on public.refunds;
drop policy if exists refunds_pro_rw on public.refunds;
drop policy if exists refunds_customer_read on public.refunds;
create policy refunds_workspace_manage on public.refunds for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
create policy refunds_platform_read on public.refunds for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy refunds_customer_read on public.refunds for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      where p.id = refunds.payment_id
        and p.tenant_id = refunds.tenant_id
        and i.tenant_id = refunds.tenant_id
        and i.customer_profile_id = auth.uid()
    )
  );

drop policy if exists meetings_platform_read on public.meetings;
drop policy if exists meetings_pro_tenant_rw on public.meetings;
drop policy if exists meetings_customer_read on public.meetings;
create policy meetings_pro_manage on public.meetings for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
create policy meetings_platform_read on public.meetings for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'super_admin')
    )
  );
create policy meetings_customer_read on public.meetings for select
  using (
    public.has_company_access(tenant_id)
    and customer_profile_id = auth.uid()
    and exists (
      select 1 from public.customer_profiles cp
      where cp.profile_id = auth.uid()
        and cp.linked_company_id = meetings.company_id
    )
  );

drop policy if exists meeting_ai_summaries_platform_read on public.meeting_ai_summaries;
drop policy if exists meeting_ai_summaries_pro_read on public.meeting_ai_summaries;
drop policy if exists meeting_ai_summaries_customer_read on public.meeting_ai_summaries;
create policy meeting_ai_summaries_operator_read on public.meeting_ai_summaries for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy meeting_ai_summaries_customer_read on public.meeting_ai_summaries for select
  using (
    public.has_company_access(tenant_id)
    and customer_visible = true
    and exists (
      select 1 from public.meetings m
      where m.id = meeting_ai_summaries.meeting_id
        and m.tenant_id = meeting_ai_summaries.tenant_id
        and m.customer_profile_id = auth.uid()
    )
  );

drop policy if exists bulk_import_jobs_admin_read on public.bulk_import_jobs;
drop policy if exists bulk_import_jobs_tenant_read on public.bulk_import_jobs;
drop policy if exists bulk_import_jobs_tenant_create on public.bulk_import_jobs;
drop policy if exists bulk_import_jobs_tenant_update on public.bulk_import_jobs;
create policy bulk_import_jobs_operator_read on public.bulk_import_jobs for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy bulk_import_jobs_pro_create on public.bulk_import_jobs for insert
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
create policy bulk_import_jobs_pro_update on public.bulk_import_jobs for update
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists service_cases_platform_read on public.service_cases;
drop policy if exists service_cases_pro_read on public.service_cases;
drop policy if exists service_cases_pro_write on public.service_cases;
create policy service_cases_operator_read on public.service_cases for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'admin', 'super_admin')
        and p.status = 'active'
    )
  );

-- Live workspace access also covers adjacent tenant resources and storage paths,
-- closing stale-token bypasses outside the primary company tables.
drop policy if exists meeting_slots_tenant_read on public.meeting_slots;
drop policy if exists meeting_slots_pro_write on public.meeting_slots;
create policy meeting_slots_workspace_read on public.meeting_slots for select
  using (public.has_company_access(tenant_id));
create policy meeting_slots_pro_write on public.meeting_slots for all
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists subscriptions_pro_read_own on public.subscriptions;
drop policy if exists subscriptions_platform_read on public.subscriptions;
create policy subscriptions_platform_read on public.subscriptions for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy subscriptions_pro_read_own on public.subscriptions for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists employee_notification_preferences_tenant_operator_read
  on public.employee_notification_preferences;
drop policy if exists employee_notification_preferences_super_admin_read
  on public.employee_notification_preferences;
drop policy if exists employee_notification_preferences_self_read
  on public.employee_notification_preferences;
drop policy if exists employee_notification_preferences_self_update
  on public.employee_notification_preferences;
drop policy if exists employee_notification_preferences_self_insert
  on public.employee_notification_preferences;
create policy employee_notification_preferences_self_read
  on public.employee_notification_preferences for select
  using (
    profile_id = auth.uid()
    and public.has_company_access(tenant_id)
  );
create policy employee_notification_preferences_self_update
  on public.employee_notification_preferences for update
  using (
    profile_id = auth.uid()
    and public.has_company_access(tenant_id)
  )
  with check (
    profile_id = auth.uid()
    and public.has_company_access(tenant_id)
  );
create policy employee_notification_preferences_self_insert
  on public.employee_notification_preferences for insert
  with check (
    profile_id = auth.uid()
    and public.has_company_access(tenant_id)
  );
create policy employee_notification_preferences_platform_read
  on public.employee_notification_preferences for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
create policy employee_notification_preferences_tenant_operator_read
  on public.employee_notification_preferences for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists tenants_read_member on public.tenants;
create policy tenants_read_member on public.tenants for select
  using (public.has_company_access(id));

drop policy if exists profiles_read_tenant on public.profiles;
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_super_admin_write on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_admin_read_all on public.profiles;
drop policy if exists profiles_admin_write_non_super on public.profiles;
create policy profiles_read_self on public.profiles for select
  using (id = auth.uid() and status = 'active');
create policy profiles_platform_read on public.profiles for select
  using (public.has_company_access(null::uuid));
create policy profiles_read_tenant on public.profiles for select
  using (tenant_id is not null and public.has_company_access(tenant_id));

drop policy if exists invites_rw_tenant on public.invites;
create policy invites_rw_tenant on public.invites for all
  using (
    tenant_id is not null
    and public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  )
  with check (
    tenant_id is not null
    and public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists pro_profiles_self_read on public.pro_profiles;
drop policy if exists pro_profiles_self_update on public.pro_profiles;
drop policy if exists pro_profiles_super_admin_all on public.pro_profiles;
drop policy if exists pro_profiles_tenant_read on public.pro_profiles;
revoke update on table public.pro_profiles from public, anon, authenticated;
grant update (
  service_areas, bio
) on table public.pro_profiles to authenticated;
create policy pro_profiles_self_read on public.pro_profiles for select
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role = 'pro'
        and actor.status = 'active'
    )
  );
create policy pro_profiles_self_safe_update on public.pro_profiles for update
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role = 'pro'
        and actor.status = 'active'
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role = 'pro'
        and actor.status = 'active'
    )
  );
create policy pro_profiles_platform_read on public.pro_profiles for select
  using (public.has_company_access(null::uuid));
create policy pro_profiles_tenant_read on public.pro_profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = pro_profiles.profile_id
        and p.tenant_id is not null
        and public.has_company_access(p.tenant_id)
    )
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role in ('pro', 'admin', 'super_admin')
        and actor.status = 'active'
    )
  );

drop policy if exists customer_profiles_tenant_pro_read on public.customer_profiles;
drop policy if exists customer_profiles_self_rw on public.customer_profiles;
create policy customer_profiles_self_rw on public.customer_profiles for all
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.company_profiles c
      where c.id = customer_profiles.linked_company_id
        and public.has_company_access(c.tenant_id)
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.company_profiles c
      where c.id = customer_profiles.linked_company_id
        and public.has_company_access(c.tenant_id)
    )
  );
create policy customer_profiles_tenant_pro_read on public.customer_profiles for select
  using (
    exists (
      select 1 from public.company_profiles c
      where c.id = customer_profiles.linked_company_id
        and public.has_company_access(c.tenant_id)
    )
    and exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid()
        and actor.role in ('pro', 'admin', 'super_admin')
        and actor.status = 'active'
    )
  );

drop policy if exists outbound_emails_tenant_read on public.outbound_emails;
create policy outbound_emails_tenant_read on public.outbound_emails for select
  using (
    tenant_id is not null
    and public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists outbound_whatsapp_tenant_read on public.outbound_whatsapp;
create policy outbound_whatsapp_tenant_read on public.outbound_whatsapp for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists whatsapp_inbox_tenant_read on public.whatsapp_inbox;
create policy whatsapp_inbox_tenant_read on public.whatsapp_inbox for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists outbound_sms_tenant_read on public.outbound_sms;
create policy outbound_sms_tenant_read on public.outbound_sms for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists sms_inbox_tenant_read on public.sms_inbox;
create policy sms_inbox_tenant_read on public.sms_inbox for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists consent_opt_outs_pro_customer_phone_read on public.consent_opt_outs;
drop policy if exists consent_opt_outs_admin_all on public.consent_opt_outs;
drop policy if exists consent_opt_outs_customer_self_read on public.consent_opt_outs;
create policy consent_opt_outs_admin_all on public.consent_opt_outs for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
create policy consent_opt_outs_customer_self_read on public.consent_opt_outs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'customer'
        and p.status = 'active'
        and p.tenant_id is not null
        and p.phone = consent_opt_outs.phone_e164
        and public.has_company_access(p.tenant_id)
    )
  );
create policy consent_opt_outs_pro_customer_phone_read on public.consent_opt_outs for select
  using (
    exists (
      select 1
      from public.customer_profiles cp
      join public.profiles p on p.id = cp.profile_id
      where p.phone = consent_opt_outs.phone_e164
        and p.tenant_id is not null
        and public.has_company_access(p.tenant_id)
        and exists (
          select 1 from public.profiles actor
          where actor.id = auth.uid()
            and actor.role = 'pro'
            and actor.status = 'active'
        )
    )
  );

drop policy if exists leads_pro_tenant_read on public.leads;
drop policy if exists leads_platform_read_all on public.leads;
create policy leads_platform_read_all on public.leads for select
  using (public.has_company_access(null::uuid));
create policy leads_pro_tenant_read on public.leads for select
  using (
    tenant_id is not null
    and public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists lead_events_pro_tenant_read on public.lead_events;
drop policy if exists lead_events_platform_read_all on public.lead_events;
create policy lead_events_platform_read_all on public.lead_events for select
  using (public.has_company_access(null::uuid));
create policy lead_events_pro_tenant_read on public.lead_events for select
  using (
    tenant_id is not null
    and public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists erasure_requests_subject_insert on public.erasure_requests;
drop policy if exists erasure_requests_platform_read on public.erasure_requests;
drop policy if exists erasure_requests_platform_update on public.erasure_requests;
create policy erasure_requests_platform_read on public.erasure_requests for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
    and (subject_tenant_id is null or public.has_company_access(subject_tenant_id))
  );
create policy erasure_requests_platform_update on public.erasure_requests for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
    and (subject_tenant_id is null or public.has_company_access(subject_tenant_id))
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
    and (subject_tenant_id is null or public.has_company_access(subject_tenant_id))
  );
create policy erasure_requests_subject_insert on public.erasure_requests for insert
  with check (
    subject_user_id = auth.uid()
    and subject_tenant_id is not null
    and public.has_company_access(subject_tenant_id)
  );
drop policy if exists erasure_requests_pro_tenant_read on public.erasure_requests;
create policy erasure_requests_pro_tenant_read on public.erasure_requests for select
  using (
    subject_tenant_id is not null
    and public.has_company_access(subject_tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists tenant_documents_super_admin_read on storage.objects;
drop policy if exists tenant_documents_admin_read on storage.objects;
drop policy if exists tenant_documents_platform_read on storage.objects;
create policy tenant_documents_platform_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and public.has_company_access(null::uuid)
    and public.has_company_storage_access(name)
  );
drop policy if exists tenant_documents_tenant_read on storage.objects;
create policy tenant_documents_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-documents'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  );
drop policy if exists tenant_documents_tenant_write on storage.objects;
create policy tenant_documents_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-documents'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  );

drop policy if exists tenant_imports_admin_read on storage.objects;
create policy tenant_imports_platform_read on storage.objects for select
  using (
    bucket_id = 'tenant-imports'
    and public.has_company_access(null::uuid)
    and public.has_company_storage_access(name)
  );
drop policy if exists tenant_imports_tenant_read on storage.objects;
create policy tenant_imports_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-imports'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );
drop policy if exists tenant_imports_tenant_write on storage.objects;
create policy tenant_imports_tenant_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-imports'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

drop policy if exists tenant_meetings_platform_read on storage.objects;
create policy tenant_meetings_platform_read on storage.objects for select
  using (
    bucket_id = 'tenant-meetings'
    and public.has_company_access(null::uuid)
    and public.has_company_storage_access(name)
  );
drop policy if exists tenant_meetings_tenant_read on storage.objects;
create policy tenant_meetings_tenant_read on storage.objects for select
  using (
    bucket_id = 'tenant-meetings'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'customer')
        and p.status = 'active'
    )
  );

drop policy if exists meeting_slots_platform_read on public.meeting_slots;
create policy meeting_slots_platform_read on public.meeting_slots for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'super_admin')
        and p.status = 'active'
    )
  );
drop policy if exists tenant_meetings_system_write on storage.objects;
create policy tenant_meetings_system_write on storage.objects for insert
  with check (
    bucket_id = 'tenant-meetings'
    and public.has_company_storage_access(name)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'pro' and p.status = 'active'
    )
  );

create policy pro_company_assignments_live_read
  on public.pro_company_assignments for select
  using (
    public.has_company_access(tenant_id)
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('pro', 'admin', 'super_admin')
        and p.status = 'active'
    )
  );

-- Replace every remaining authenticated dashboard policy that authorizes from
-- cached JWT role claims. Intentional anonymous/public content reads remain.
drop policy if exists outbound_emails_super_admin_read on public.outbound_emails;
create policy outbound_emails_platform_read on public.outbound_emails for select
  using (public.has_company_access(null::uuid));
drop policy if exists outbound_whatsapp_super_admin_read on public.outbound_whatsapp;
create policy outbound_whatsapp_platform_read on public.outbound_whatsapp for select
  using (public.has_company_access(null::uuid));
drop policy if exists whatsapp_inbox_super_admin_read on public.whatsapp_inbox;
create policy whatsapp_inbox_platform_read on public.whatsapp_inbox for select
  using (public.has_company_access(null::uuid));
drop policy if exists outbound_sms_super_admin_read on public.outbound_sms;
create policy outbound_sms_platform_read on public.outbound_sms for select
  using (public.has_company_access(null::uuid));
drop policy if exists sms_inbox_super_admin_read on public.sms_inbox;
create policy sms_inbox_platform_read on public.sms_inbox for select
  using (public.has_company_access(null::uuid));

drop policy if exists admin_audit_actions_super_admin_read on public.admin_audit_actions;
create policy admin_audit_actions_platform_read on public.admin_audit_actions for select
  using (public.has_company_access(null::uuid));

drop policy if exists cost_data_admin_all on public.cost_data;
create policy cost_data_admin_all on public.cost_data for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));

drop policy if exists whatsapp_template_approvals_platform_read
  on public.whatsapp_template_approvals;
drop policy if exists whatsapp_template_approvals_platform_insert
  on public.whatsapp_template_approvals;
drop policy if exists whatsapp_template_approvals_platform_update
  on public.whatsapp_template_approvals;
drop policy if exists whatsapp_template_approvals_platform_delete
  on public.whatsapp_template_approvals;
create policy whatsapp_template_approvals_platform_read
  on public.whatsapp_template_approvals for select
  using (public.has_company_access(null::uuid));
create policy whatsapp_template_approvals_platform_insert
  on public.whatsapp_template_approvals for insert
  with check (public.has_company_access(null::uuid));
create policy whatsapp_template_approvals_platform_update
  on public.whatsapp_template_approvals for update
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
create policy whatsapp_template_approvals_platform_delete
  on public.whatsapp_template_approvals for delete
  using (public.has_company_access(null::uuid));

drop policy if exists blog_media_platform_manage on public.blog_media;
create policy blog_media_platform_manage on public.blog_media for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
drop policy if exists blog_posts_platform_manage on public.blog_posts;
create policy blog_posts_platform_manage on public.blog_posts for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
drop policy if exists blog_terms_platform_manage on public.blog_terms;
create policy blog_terms_platform_manage on public.blog_terms for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
drop policy if exists blog_post_terms_platform_manage on public.blog_post_terms;
create policy blog_post_terms_platform_manage on public.blog_post_terms for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
drop policy if exists blog_post_gallery_items_platform_manage
  on public.blog_post_gallery_items;
create policy blog_post_gallery_items_platform_manage
  on public.blog_post_gallery_items for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));
drop policy if exists blog_post_revisions_platform_read on public.blog_post_revisions;
drop policy if exists blog_post_revisions_platform_insert on public.blog_post_revisions;
create policy blog_post_revisions_platform_read on public.blog_post_revisions for select
  using (public.has_company_access(null::uuid));
create policy blog_post_revisions_platform_insert on public.blog_post_revisions for insert
  with check (public.has_company_access(null::uuid));

drop policy if exists blog_media_storage_platform_insert on storage.objects;
drop policy if exists blog_media_storage_platform_update on storage.objects;
drop policy if exists blog_media_storage_platform_delete on storage.objects;
create policy blog_media_storage_platform_insert on storage.objects for insert
  with check (
    bucket_id = 'blog-media'
    and public.has_company_access(null::uuid)
  );
create policy blog_media_storage_platform_update on storage.objects for update
  using (
    bucket_id = 'blog-media'
    and public.has_company_access(null::uuid)
  )
  with check (
    bucket_id = 'blog-media'
    and public.has_company_access(null::uuid)
  );
create policy blog_media_storage_platform_delete on storage.objects for delete
  using (
    bucket_id = 'blog-media'
    and public.has_company_access(null::uuid)
  );

drop policy if exists cms_pages_platform_manage on public.cms_pages;
create policy cms_pages_platform_manage on public.cms_pages for all
  using (public.has_company_access(null::uuid))
  with check (public.has_company_access(null::uuid));

commit;
