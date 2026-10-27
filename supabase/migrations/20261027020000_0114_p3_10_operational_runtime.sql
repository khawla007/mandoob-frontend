begin;

-- Persistent P3.10 local projections. External channel consumers remain disabled.
create table public.operational_notifications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  source_event_id uuid not null references public.domain_events(id) on delete restrict,
  source_job_id uuid not null references public.event_jobs(id) on delete restrict,
  projection_key text not null,
  notification_code text not null,
  severity text not null default 'info',
  safe_metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint operational_notifications_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint operational_notifications_projection_key_valid
    check (projection_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint operational_notifications_code_valid
    check (notification_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint operational_notifications_severity_valid
    check (severity in ('info', 'success', 'warning', 'critical')),
  constraint operational_notifications_metadata_safe
    check (
      pg_catalog.jsonb_typeof(safe_metadata) = 'object'
      and public.event_payload_is_safe(safe_metadata)
    ),
  constraint operational_notifications_event_projection_unique
    unique (source_event_id, projection_key)
);

create index operational_notifications_cursor_idx
  on public.operational_notifications (tenant_id, company_id, created_at desc, id desc);
create index operational_notifications_recipient_cursor_idx
  on public.operational_notifications
  (tenant_id, company_id, recipient_profile_id, created_at desc, id desc);

create table public.operational_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  assigned_profile_id uuid references public.profiles(id) on delete restrict,
  source_event_id uuid not null references public.domain_events(id) on delete restrict,
  source_job_id uuid not null references public.event_jobs(id) on delete restrict,
  projection_key text not null,
  task_code text not null,
  state text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint operational_tasks_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint operational_tasks_projection_key_valid
    check (projection_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint operational_tasks_code_valid check (task_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint operational_tasks_state_valid check (state in ('open', 'in_progress', 'done', 'cancelled')),
  constraint operational_tasks_priority_valid check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint operational_tasks_metadata_safe check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
    and public.event_payload_is_safe(safe_metadata)
  ),
  constraint operational_tasks_event_projection_unique unique (source_event_id, projection_key)
);

create index operational_tasks_cursor_idx
  on public.operational_tasks (tenant_id, company_id, created_at desc, id desc);
create index operational_tasks_assignee_cursor_idx
  on public.operational_tasks
  (tenant_id, company_id, assigned_profile_id, created_at desc, id desc);

create table public.operational_activity (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source_event_id uuid not null references public.domain_events(id) on delete restrict,
  source_job_id uuid not null references public.event_jobs(id) on delete restrict,
  projection_key text not null,
  activity_code text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint operational_activity_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint operational_activity_projection_key_valid
    check (projection_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint operational_activity_code_valid
    check (activity_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint operational_activity_metadata_safe check (
    pg_catalog.jsonb_typeof(safe_metadata) = 'object'
    and public.event_payload_is_safe(safe_metadata)
  ),
  constraint operational_activity_event_projection_unique unique (source_event_id, projection_key)
);

create index operational_activity_cursor_idx
  on public.operational_activity (tenant_id, company_id, created_at desc, id desc);

create table public.message_template_versions (
  template_key text not null,
  version integer not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (template_key, version, channel),
  constraint message_template_key_valid check (template_key ~ '^[a-z][a-z0-9_.-]{0,127}$'),
  constraint message_template_version_valid check (version between 1 and 2147483647),
  constraint message_template_channel_valid check (channel in ('email', 'sms', 'whatsapp')),
  constraint message_template_subject_bounded check (
    subject_template is null or pg_catalog.char_length(subject_template) between 1 and 240
  ),
  constraint message_template_body_bounded
    check (pg_catalog.char_length(body_template) between 1 and 10000)
);

create table public.company_message_template_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  template_key text not null,
  version integer not null,
  channel text not null,
  subject_template text,
  body_template text,
  enabled boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (tenant_id, company_id, template_key, version, channel),
  constraint company_message_template_overrides_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint company_message_template_overrides_template_fkey
    foreign key (template_key, version, channel)
    references public.message_template_versions (template_key, version, channel)
    on delete restrict,
  constraint company_message_template_overrides_subject_bounded check (
    subject_template is null or pg_catalog.char_length(subject_template) between 1 and 240
  ),
  constraint company_message_template_overrides_body_bounded check (
    body_template is null or pg_catalog.char_length(body_template) between 1 and 10000
  )
);

create table public.runtime_delivery_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  enabled boolean not null default false,
  opted_out boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (tenant_id, company_id, profile_id, channel),
  constraint runtime_delivery_preferences_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint runtime_delivery_preferences_channel_valid
    check (channel in ('email', 'sms', 'whatsapp')),
  constraint runtime_delivery_preferences_disabled_when_opted_out
    check (not opted_out or not enabled)
);

create table public.runtime_delivery_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null,
  event_id uuid not null references public.domain_events(id) on delete restrict,
  job_id uuid not null references public.event_jobs(id) on delete restrict,
  attempt_number smallint not null,
  channel text not null,
  provider_category text not null,
  provider_code text not null,
  retryable boolean not null,
  effect_reference_hash text,
  delivery_state text not null,
  reconciliation_state text not null,
  attempted_at timestamptz not null,
  reconciled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint runtime_delivery_receipts_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete cascade,
  constraint runtime_delivery_receipts_attempt_valid check (attempt_number between 1 and 25),
  constraint runtime_delivery_receipts_channel_valid check (channel in ('email', 'sms', 'whatsapp')),
  constraint runtime_delivery_receipts_provider_category_valid check (
    provider_category in (
      'accepted', 'authentication', 'configuration', 'invalid_recipient',
      'invalid_template', 'rate_limited', 'provider_unavailable', 'timeout',
      'rejected', 'unknown'
    )
  ),
  constraint runtime_delivery_receipts_provider_code_valid check (
    provider_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
  ),
  constraint runtime_delivery_receipts_effect_reference_hash_valid check (
    effect_reference_hash is null or effect_reference_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint runtime_delivery_receipts_delivery_state_valid
    check (delivery_state in ('accepted', 'delivered', 'retryable', 'failed', 'unknown')),
  constraint runtime_delivery_receipts_reconciliation_state_valid
    check (reconciliation_state in ('pending', 'confirmed', 'disputed', 'not_applicable')),
  constraint runtime_delivery_receipts_reconciled_shape check (
    (reconciliation_state = 'pending' and reconciled_at is null)
    or (reconciliation_state <> 'pending' and reconciled_at is not null)
  ),
  constraint runtime_delivery_receipts_job_attempt_unique unique (job_id, attempt_number)
);

create index runtime_delivery_receipts_company_cursor_idx
  on public.runtime_delivery_receipts (tenant_id, company_id, created_at desc, id desc);
create index runtime_delivery_receipts_reconciliation_idx
  on public.runtime_delivery_receipts
  (reconciliation_state, attempted_at, id)
  where reconciliation_state = 'pending';

create table public.operational_runtime_audit (
  id bigint generated always as identity primary key,
  operation_id uuid not null unique,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_id uuid not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  source_event_id uuid references public.domain_events(id) on delete restrict,
  source_job_id uuid references public.event_jobs(id) on delete restrict,
  action_code text not null,
  resource_type text not null,
  resource_id uuid not null,
  outcome text not null default 'applied',
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint operational_runtime_audit_company_fkey
    foreign key (tenant_id, company_id)
    references public.company_profiles (tenant_id, id)
    on delete restrict,
  constraint operational_runtime_audit_action_valid
    check (action_code in ('NOTIFICATION_READ_STATE_SET', 'PROJECTION_WRITTEN', 'DELIVERY_RECEIPT_RECORDED')),
  constraint operational_runtime_audit_resource_valid
    check (resource_type in ('notification', 'task', 'activity', 'delivery_receipt')),
  constraint operational_runtime_audit_outcome_valid check (outcome in ('applied', 'replayed'))
);

create index operational_runtime_audit_company_cursor_idx
  on public.operational_runtime_audit (tenant_id, company_id, occurred_at desc, id desc);

alter table public.operational_notifications enable row level security;
alter table public.operational_notifications force row level security;
alter table public.operational_tasks enable row level security;
alter table public.operational_tasks force row level security;
alter table public.operational_activity enable row level security;
alter table public.operational_activity force row level security;
alter table public.message_template_versions enable row level security;
alter table public.message_template_versions force row level security;
alter table public.company_message_template_overrides enable row level security;
alter table public.company_message_template_overrides force row level security;
alter table public.runtime_delivery_preferences enable row level security;
alter table public.runtime_delivery_preferences force row level security;
alter table public.runtime_delivery_receipts enable row level security;
alter table public.runtime_delivery_receipts force row level security;
alter table public.operational_runtime_audit enable row level security;
alter table public.operational_runtime_audit force row level security;

revoke all on table public.operational_notifications from public, anon, authenticated, service_role;
revoke all on table public.operational_tasks from public, anon, authenticated, service_role;
revoke all on table public.operational_activity from public, anon, authenticated, service_role;
revoke all on table public.message_template_versions from public, anon, authenticated, service_role;
revoke all on table public.company_message_template_overrides from public, anon, authenticated, service_role;
revoke all on table public.runtime_delivery_preferences from public, anon, authenticated, service_role;
revoke all on table public.runtime_delivery_receipts from public, anon, authenticated, service_role;
revoke all on table public.operational_runtime_audit from public, anon, authenticated, service_role;
revoke all on sequence public.operational_runtime_audit_id_seq
  from public, anon, authenticated, service_role;

create or replace function public.runtime_actor_company_access(
  p_company_id uuid,
  p_allow_member boolean default true
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_tenant_id uuid;
begin
  select company.tenant_id into v_tenant_id
  from public.company_profiles as company
  join public.tenants as tenant on tenant.id = company.tenant_id and tenant.status = 'active'
  where company.id = p_company_id;

  select * into v_profile
  from public.profiles as profile
  where profile.id = v_actor_id
    and profile.status::text = 'active';

  if not found or v_tenant_id is null then
    raise exception using errcode = '42501', message = 'RUNTIME_ACCESS_DENIED';
  end if;

  if v_profile.role::text in ('admin', 'super_admin') and v_profile.tenant_id is null then
    return v_profile.role::text;
  end if;

  if v_profile.role::text = 'pro' and exists (
    select 1
    from public.pro_company_assignments as assignment
    where assignment.pro_profile_id = v_actor_id
      and assignment.company_id = p_company_id
      and assignment.tenant_id = v_tenant_id
      and assignment.status::text = 'active'
  ) then
    return 'pro';
  end if;

  if p_allow_member and v_profile.role::text = 'customer' and exists (
    select 1
    from public.customer_profiles as customer
    where customer.profile_id = v_actor_id
      and customer.linked_company_id = p_company_id
      and v_profile.tenant_id = v_tenant_id
  ) then
    return 'customer';
  end if;

  if p_allow_member and v_profile.role::text = 'employee' and exists (
    select 1
    from public.employees as employee
    where employee.profile_id = v_actor_id
      and employee.company_id = p_company_id
      and employee.tenant_id = v_tenant_id
      and employee.status::text = 'active'
  ) then
    return 'employee';
  end if;

  raise exception using errcode = '42501', message = 'RUNTIME_ACCESS_DENIED';
end;
$$;

revoke all on function public.runtime_actor_company_access(uuid, boolean)
  from public, anon, authenticated, service_role;

create or replace function public.list_operational_notifications(
  p_company_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
) returns setof public.operational_notifications
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if not (p_limit between 1 and 100)
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_CURSOR';
  end if;
  v_role := public.runtime_actor_company_access(p_company_id, true);
  return query
  select notification.*
  from public.operational_notifications as notification
  where notification.company_id = p_company_id
    and (v_role in ('admin', 'super_admin', 'pro') or notification.recipient_profile_id = v_actor_id)
    and (
      p_before_created_at is null
      or notification.created_at < p_before_created_at
      or (notification.created_at = p_before_created_at and notification.id < p_before_id)
    )
  order by notification.created_at desc, notification.id desc
  limit p_limit;
end;
$$;

create or replace function public.list_operational_tasks(
  p_company_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
) returns setof public.operational_tasks
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text;
begin
  if not (p_limit between 1 and 100)
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_CURSOR';
  end if;
  v_role := public.runtime_actor_company_access(p_company_id, true);
  return query
  select task.*
  from public.operational_tasks as task
  where task.company_id = p_company_id
    and (v_role in ('admin', 'super_admin', 'pro') or task.assigned_profile_id = v_actor_id)
    and (
      p_before_created_at is null
      or task.created_at < p_before_created_at
      or (task.created_at = p_before_created_at and task.id < p_before_id)
    )
  order by task.created_at desc, task.id desc
  limit p_limit;
end;
$$;

create or replace function public.list_operational_activity(
  p_company_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
) returns setof public.operational_activity
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (p_limit between 1 and 100)
    or ((p_before_created_at is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_CURSOR';
  end if;
  perform public.runtime_actor_company_access(p_company_id, true);
  return query
  select activity.*
  from public.operational_activity as activity
  where activity.company_id = p_company_id
    and (
      p_before_created_at is null
      or activity.created_at < p_before_created_at
      or (activity.created_at = p_before_created_at and activity.id < p_before_id)
    )
  order by activity.created_at desc, activity.id desc
  limit p_limit;
end;
$$;

create or replace function public.set_operational_notification_read_state(
  p_notification_id uuid,
  p_read boolean,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_notification public.operational_notifications%rowtype;
  v_existing public.operational_runtime_audit%rowtype;
begin
  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_OPERATION';
  end if;
  select * into v_notification
  from public.operational_notifications as notification
  where notification.id = p_notification_id
  for update;
  if not found or v_notification.recipient_profile_id <> v_actor_id then
    raise exception using errcode = '42501', message = 'RUNTIME_ACCESS_DENIED';
  end if;
  perform public.runtime_actor_company_access(v_notification.company_id, true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_existing
  from public.operational_runtime_audit as audit
  where audit.operation_id = p_operation_id;
  if found then
    if v_existing.action_code <> 'NOTIFICATION_READ_STATE_SET'
      or v_existing.resource_id <> p_notification_id
      or v_existing.actor_profile_id is distinct from v_actor_id then
      raise exception using errcode = 'P3101', message = 'RUNTIME_OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object('state', 'replayed', 'notificationId', p_notification_id);
  end if;

  update public.operational_notifications
  set read_at = case when p_read then pg_catalog.now() else null end
  where id = p_notification_id;
  insert into public.operational_runtime_audit (
    operation_id, tenant_id, company_id, actor_profile_id, source_event_id, source_job_id,
    action_code, resource_type, resource_id
  ) values (
    p_operation_id, v_notification.tenant_id, v_notification.company_id, v_actor_id,
    v_notification.source_event_id, v_notification.source_job_id,
    'NOTIFICATION_READ_STATE_SET', 'notification', p_notification_id
  );
  return pg_catalog.jsonb_build_object(
    'state', case when p_read then 'read' else 'unread' end,
    'notificationId', p_notification_id
  );
end;
$$;

create or replace function public.resolve_runtime_delivery_policy(
  p_tenant_id uuid,
  p_company_id uuid,
  p_profile_id uuid,
  p_event_id uuid,
  p_job_id uuid,
  p_template_key text,
  p_version integer,
  p_channel text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base public.message_template_versions%rowtype;
  v_override public.company_message_template_overrides%rowtype;
  v_preference public.runtime_delivery_preferences%rowtype;
  v_recipient_valid boolean;
  v_state text;
begin
  if p_channel not in ('email', 'sms', 'whatsapp') then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_CHANNEL';
  end if;
  if not exists (
    select 1
    from public.domain_events as event
    join public.event_jobs as job on job.event_id = event.id
    where event.id = p_event_id
      and job.id = p_job_id
      and event.tenant_id = p_tenant_id
      and event.company_id = p_company_id
  ) then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;
  select exists (
    select 1 from public.profiles as profile
    where profile.id = p_profile_id and profile.status::text = 'active'
      and (
        exists (
          select 1 from public.pro_company_assignments as assignment
          where assignment.pro_profile_id = profile.id
            and assignment.tenant_id = p_tenant_id
            and assignment.company_id = p_company_id
            and assignment.status::text = 'active'
        )
        or exists (
          select 1 from public.customer_profiles as customer
          where customer.profile_id = profile.id
            and customer.linked_company_id = p_company_id
            and profile.tenant_id = p_tenant_id
        )
        or exists (
          select 1 from public.employees as employee
          where employee.profile_id = profile.id
            and employee.tenant_id = p_tenant_id
            and employee.company_id = p_company_id
            and employee.status::text = 'active'
        )
      )
  ) into v_recipient_valid;
  if not v_recipient_valid then
    raise exception using errcode = '42501', message = 'RUNTIME_RECIPIENT_SCOPE_DENIED';
  end if;

  select * into v_base
  from public.message_template_versions as template
  where template.template_key = p_template_key
    and template.version = p_version
    and template.channel = p_channel;
  select * into v_override
  from public.company_message_template_overrides as override
  where override.tenant_id = p_tenant_id
    and override.company_id = p_company_id
    and override.template_key = p_template_key
    and override.version = p_version
    and override.channel = p_channel;
  select * into v_preference
  from public.runtime_delivery_preferences as preference
  where preference.tenant_id = p_tenant_id
    and preference.company_id = p_company_id
    and preference.profile_id = p_profile_id
    and preference.channel = p_channel;

  v_state := case
    when v_base.template_key is null then 'template_missing'
    when not v_base.enabled then 'channel_disabled'
    when v_override.template_key is null or not v_override.enabled then 'company_disabled'
    when v_preference.profile_id is null or not v_preference.enabled or v_preference.opted_out
      then 'recipient_opted_out'
    else 'allowed'
  end;
  return pg_catalog.jsonb_build_object(
    'state', v_state,
    'templateKey', p_template_key,
    'version', p_version,
    'channel', p_channel,
    'subjectTemplate', case when v_state = 'allowed'
      then coalesce(v_override.subject_template, v_base.subject_template) else null end,
    'bodyTemplate', case when v_state = 'allowed'
      then coalesce(v_override.body_template, v_base.body_template) else null end
  );
end;
$$;

create or replace function public.write_operational_projection(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_event_id uuid,
  p_job_id uuid,
  p_projection_type text,
  p_projection_key text,
  p_code text,
  p_profile_id uuid default null,
  p_state text default null,
  p_priority text default null,
  p_due_at timestamptz default null,
  p_safe_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.operational_runtime_audit%rowtype;
begin
  if p_operation_id is null
    or p_projection_type not in ('notification', 'task', 'activity')
    or p_projection_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
    or p_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or not public.event_payload_is_safe(p_safe_metadata) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_PROJECTION';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_existing
  from public.operational_runtime_audit as audit
  where audit.operation_id = p_operation_id;
  if found then
    if v_existing.action_code <> 'PROJECTION_WRITTEN'
      or v_existing.tenant_id <> p_tenant_id
      or v_existing.company_id <> p_company_id
      or v_existing.source_event_id <> p_event_id
      or v_existing.source_job_id <> p_job_id
      or v_existing.resource_type <> p_projection_type then
      raise exception using errcode = 'P3101', message = 'RUNTIME_OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object(
      'state', 'replayed', 'projectionType', p_projection_type, 'projectionId', v_existing.resource_id
    );
  end if;
  if not exists (
    select 1
    from public.domain_events as event
    join public.event_jobs as job on job.event_id = event.id
    where event.id = p_event_id
      and job.id = p_job_id
      and event.tenant_id = p_tenant_id
      and event.company_id = p_company_id
      and job.state = 'leased'
  ) then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;
  if p_profile_id is not null and not exists (
    select 1 from public.profiles as profile
    where profile.id = p_profile_id and profile.status::text = 'active'
      and (
        exists (
          select 1 from public.pro_company_assignments as assignment
          where assignment.pro_profile_id = profile.id and assignment.tenant_id = p_tenant_id
            and assignment.company_id = p_company_id and assignment.status::text = 'active'
        )
        or exists (
          select 1 from public.customer_profiles as customer
          where customer.profile_id = profile.id and customer.linked_company_id = p_company_id
            and profile.tenant_id = p_tenant_id
        )
        or exists (
          select 1 from public.employees as employee
          where employee.profile_id = profile.id and employee.tenant_id = p_tenant_id
            and employee.company_id = p_company_id and employee.status::text = 'active'
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'RUNTIME_RECIPIENT_SCOPE_DENIED';
  end if;

  if p_projection_type = 'notification' then
    if p_profile_id is null then
      raise exception using errcode = '22023', message = 'RUNTIME_RECIPIENT_REQUIRED';
    end if;
    insert into public.operational_notifications (
      tenant_id, company_id, recipient_profile_id, source_event_id, source_job_id,
      projection_key, notification_code, severity, safe_metadata
    ) values (
      p_tenant_id, p_company_id, p_profile_id, p_event_id, p_job_id,
      p_projection_key, p_code, coalesce(p_state, 'info'), p_safe_metadata
    )
    on conflict (source_event_id, projection_key) do nothing
    returning id into v_id;
    if v_id is null then
      select notification.id into v_id
      from public.operational_notifications as notification
      where notification.source_event_id = p_event_id
        and notification.projection_key = p_projection_key
        and notification.tenant_id = p_tenant_id
        and notification.company_id = p_company_id
        and notification.recipient_profile_id = p_profile_id
        and notification.notification_code = p_code;
    end if;
  elsif p_projection_type = 'task' then
    insert into public.operational_tasks (
      tenant_id, company_id, assigned_profile_id, source_event_id, source_job_id,
      projection_key, task_code, state, priority, due_at, safe_metadata
    ) values (
      p_tenant_id, p_company_id, p_profile_id, p_event_id, p_job_id, p_projection_key, p_code,
      coalesce(p_state, 'open'), coalesce(p_priority, 'normal'), p_due_at,
      p_safe_metadata
    )
    on conflict (source_event_id, projection_key) do nothing
    returning id into v_id;
    if v_id is null then
      select task.id into v_id
      from public.operational_tasks as task
      where task.source_event_id = p_event_id and task.projection_key = p_projection_key
        and task.tenant_id = p_tenant_id and task.company_id = p_company_id
        and task.assigned_profile_id is not distinct from p_profile_id and task.task_code = p_code;
    end if;
  else
    insert into public.operational_activity (
      tenant_id, company_id, actor_profile_id, source_event_id, source_job_id,
      projection_key, activity_code, safe_metadata
    ) values (
      p_tenant_id, p_company_id, p_profile_id, p_event_id, p_job_id,
      p_projection_key, p_code, p_safe_metadata
    )
    on conflict (source_event_id, projection_key) do nothing
    returning id into v_id;
    if v_id is null then
      select activity.id into v_id
      from public.operational_activity as activity
      where activity.source_event_id = p_event_id and activity.projection_key = p_projection_key
        and activity.tenant_id = p_tenant_id and activity.company_id = p_company_id
        and activity.actor_profile_id is not distinct from p_profile_id
        and activity.activity_code = p_code;
    end if;
  end if;
  if v_id is null then
    raise exception using errcode = 'P3102', message = 'RUNTIME_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.operational_runtime_audit (
    operation_id, tenant_id, company_id, source_event_id, source_job_id,
    action_code, resource_type, resource_id
  ) values (
    p_operation_id, p_tenant_id, p_company_id, p_event_id, p_job_id,
    'PROJECTION_WRITTEN', p_projection_type, v_id
  );
  return pg_catalog.jsonb_build_object(
    'state', 'applied', 'projectionType', p_projection_type, 'projectionId', v_id
  );
end;
$$;

create or replace function public.record_safe_delivery_receipt(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_event_id uuid,
  p_job_id uuid,
  p_attempt_number smallint,
  p_channel text,
  p_provider_category text,
  p_provider_code text,
  p_retryable boolean,
  p_effect_reference_hash text,
  p_delivery_state text,
  p_reconciliation_state text,
  p_attempted_at timestamptz,
  p_reconciled_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.operational_runtime_audit%rowtype;
begin
  if p_operation_id is null or p_attempt_number not between 1 and 25
    or p_channel not in ('email', 'sms', 'whatsapp')
    or p_provider_category not in (
      'accepted', 'authentication', 'configuration', 'invalid_recipient',
      'invalid_template', 'rate_limited', 'provider_unavailable', 'timeout', 'rejected', 'unknown'
    )
    or p_provider_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
    or (p_effect_reference_hash is not null and p_effect_reference_hash !~ '^[a-f0-9]{64}$')
    or p_delivery_state not in ('accepted', 'delivered', 'retryable', 'failed', 'unknown')
    or p_reconciliation_state not in ('pending', 'confirmed', 'disputed', 'not_applicable')
    or ((p_reconciliation_state = 'pending') <> (p_reconciled_at is null)) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_RECEIPT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_existing from public.operational_runtime_audit as audit
  where audit.operation_id = p_operation_id;
  if found then
    if v_existing.action_code <> 'DELIVERY_RECEIPT_RECORDED'
      or v_existing.tenant_id <> p_tenant_id or v_existing.company_id <> p_company_id
      or v_existing.source_event_id <> p_event_id or v_existing.source_job_id <> p_job_id then
      raise exception using errcode = 'P3101', message = 'RUNTIME_OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object('state', 'replayed', 'receiptId', v_existing.resource_id);
  end if;
  if not exists (
    select 1
    from public.domain_events as event
    join public.event_jobs as job on job.event_id = event.id
    where event.id = p_event_id
      and job.id = p_job_id
      and event.tenant_id = p_tenant_id
      and event.company_id = p_company_id
  ) then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;
  insert into public.runtime_delivery_receipts (
    tenant_id, company_id, event_id, job_id, attempt_number, channel,
    provider_category, provider_code, retryable, effect_reference_hash,
    delivery_state, reconciliation_state, attempted_at, reconciled_at
  ) values (
    p_tenant_id, p_company_id, p_event_id, p_job_id, p_attempt_number, p_channel,
    p_provider_category, p_provider_code, p_retryable, p_effect_reference_hash,
    p_delivery_state, p_reconciliation_state, p_attempted_at, p_reconciled_at
  )
  on conflict (job_id, attempt_number) do nothing
  returning id into v_id;
  if v_id is null then
    select receipt.id into v_id
    from public.runtime_delivery_receipts as receipt
    where receipt.job_id = p_job_id and receipt.attempt_number = p_attempt_number
      and receipt.tenant_id = p_tenant_id and receipt.company_id = p_company_id
      and receipt.event_id = p_event_id and receipt.channel = p_channel
      and receipt.provider_category = p_provider_category and receipt.provider_code = p_provider_code
      and receipt.retryable = p_retryable
      and receipt.effect_reference_hash is not distinct from p_effect_reference_hash
      and receipt.delivery_state = p_delivery_state
      and receipt.reconciliation_state = p_reconciliation_state
      and receipt.attempted_at = p_attempted_at
      and receipt.reconciled_at is not distinct from p_reconciled_at;
  end if;
  if v_id is null then
    raise exception using errcode = 'P3102', message = 'RUNTIME_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.operational_runtime_audit (
    operation_id, tenant_id, company_id, source_event_id, source_job_id,
    action_code, resource_type, resource_id
  ) values (
    p_operation_id, p_tenant_id, p_company_id, p_event_id, p_job_id,
    'DELIVERY_RECEIPT_RECORDED', 'delivery_receipt', v_id
  );
  return pg_catalog.jsonb_build_object('state', 'applied', 'receiptId', v_id);
end;
$$;

create or replace function public.read_operational_runtime_health(
  p_company_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := public.runtime_actor_company_access(p_company_id, false);
  if v_role not in ('admin', 'super_admin', 'pro') then
    raise exception using errcode = '42501', message = 'RUNTIME_ACCESS_DENIED';
  end if;
  return pg_catalog.jsonb_build_object(
    'state', 'local_only',
    'generatedAt', pg_catalog.statement_timestamp(),
    'notifications', (
      select pg_catalog.count(*) from public.operational_notifications as notification
      where notification.company_id = p_company_id
    ),
    'openTasks', (
      select pg_catalog.count(*) from public.operational_tasks as task
      where task.company_id = p_company_id and task.state in ('open', 'in_progress')
    ),
    'pendingReconciliation', (
      select pg_catalog.count(*) from public.runtime_delivery_receipts as receipt
      where receipt.company_id = p_company_id and receipt.reconciliation_state = 'pending'
    ),
    'externalChannelsEnabled', false
  );
end;
$$;

revoke all on function public.list_operational_notifications(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_operational_tasks(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_operational_activity(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.set_operational_notification_read_state(uuid, boolean, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_runtime_delivery_policy(uuid, uuid, uuid, uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.write_operational_projection(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.record_safe_delivery_receipt(
  uuid, uuid, uuid, uuid, uuid, smallint, text, text, text, boolean, text, text, text,
  timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.read_operational_runtime_health(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.list_operational_notifications(uuid, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.list_operational_tasks(uuid, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.list_operational_activity(uuid, timestamptz, uuid, integer)
  to authenticated;
grant execute on function public.set_operational_notification_read_state(uuid, boolean, uuid)
  to authenticated;
grant execute on function public.read_operational_runtime_health(uuid)
  to authenticated;
grant execute on function public.resolve_runtime_delivery_policy(uuid, uuid, uuid, uuid, uuid, text, integer, text)
  to service_role;
grant execute on function public.write_operational_projection(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.record_safe_delivery_receipt(
  uuid, uuid, uuid, uuid, uuid, smallint, text, text, text, boolean, text, text, text,
  timestamptz, timestamptz
) to service_role;

commit;
