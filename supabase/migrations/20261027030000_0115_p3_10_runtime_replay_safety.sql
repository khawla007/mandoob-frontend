begin;

-- Forward-only correction: fence the current lease, but key projection intent
-- to the stable root effect UUID so lease retries and manual replay jobs reuse
-- the original local effect without weakening current-job authorization.
create or replace function public.write_operational_projection(
  p_operation_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_event_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
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
  v_job public.event_jobs%rowtype;
  v_existing public.operational_runtime_audit%rowtype;
  v_request_hash text;
  v_normalized_state text;
  v_normalized_priority text;
  v_normalized_due_at timestamptz;
begin
  if p_operation_id is null or p_worker_id is null or p_lease_token is null
    or p_projection_type not in ('notification', 'task', 'activity')
    or p_projection_key !~ '^[a-z][a-z0-9_.-]{0,127}$'
    or p_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or not public.event_payload_is_safe(p_safe_metadata) then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_PROJECTION';
  end if;
  if p_projection_type = 'notification' then
    v_normalized_state := coalesce(p_state, 'info');
    v_normalized_priority := null;
    v_normalized_due_at := null;
    if v_normalized_state not in ('info', 'success', 'warning', 'critical') then
      raise exception using errcode = '22023', message = 'RUNTIME_INVALID_PROJECTION';
    end if;
  elsif p_projection_type = 'task' then
    v_normalized_state := coalesce(p_state, 'open');
    v_normalized_priority := coalesce(p_priority, 'normal');
    v_normalized_due_at := p_due_at;
    if v_normalized_state not in ('open', 'in_progress', 'done', 'cancelled')
      or v_normalized_priority not in ('low', 'normal', 'high', 'urgent') then
      raise exception using errcode = '22023', message = 'RUNTIME_INVALID_PROJECTION';
    end if;
  else
    v_normalized_state := null;
    v_normalized_priority := null;
    v_normalized_due_at := null;
  end if;

  select job.* into v_job
  from public.event_jobs as job
  where job.id = p_job_id
    and job.event_id = p_event_id
  for update of job;
  if not found then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;
  if not exists (
    select 1
    from public.domain_events as event
    join public.company_profiles as company
      on company.id = event.company_id and company.tenant_id = event.tenant_id
    join public.tenants as tenant on tenant.id = event.tenant_id
    where event.id = p_event_id
      and event.tenant_id = p_tenant_id
      and event.company_id = p_company_id
      and company.status::text = 'active'
      and tenant.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;
  if v_job.state <> 'leased'
    or v_job.lease_owner is distinct from p_worker_id
    or v_job.lease_token is distinct from p_lease_token
    or v_job.effect_key <> 'mandoob:event-job:' || p_operation_id::text
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '42501', message = 'RUNTIME_REFERENCE_SCOPE_DENIED';
  end if;

  -- Only stable projection intent participates in replay equivalence. The
  -- current job/worker/token remain authorization fences above, never intent.
  v_request_hash := public.runtime_request_hash(pg_catalog.jsonb_build_object(
    'action', 'PROJECTION_WRITTEN',
    'tenantId', p_tenant_id,
    'companyId', p_company_id,
    'eventId', p_event_id,
    'projectionType', p_projection_type,
    'projectionKey', p_projection_key,
    'code', p_code,
    'profileId', p_profile_id,
    'state', v_normalized_state,
    'priority', v_normalized_priority,
    'dueAt', v_normalized_due_at,
    'safeMetadata', p_safe_metadata
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_existing
  from public.operational_runtime_audit as audit
  where audit.operation_id = p_operation_id;
  if found then
    if v_existing.action_code <> 'PROJECTION_WRITTEN'
      or v_existing.tenant_id <> p_tenant_id
      or v_existing.company_id <> p_company_id
      or v_existing.source_event_id <> p_event_id
      or v_existing.resource_type <> p_projection_type
      or v_existing.request_hash <> v_request_hash then
      raise exception using errcode = 'P3101', message = 'RUNTIME_OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object(
      'state', 'replayed', 'projectionType', p_projection_type, 'projectionId', v_existing.resource_id
    );
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
      p_projection_key, p_code, v_normalized_state, p_safe_metadata
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
        and notification.notification_code = p_code
        and notification.severity = v_normalized_state
        and notification.safe_metadata = p_safe_metadata;
    end if;
  elsif p_projection_type = 'task' then
    insert into public.operational_tasks (
      tenant_id, company_id, assigned_profile_id, source_event_id, source_job_id,
      projection_key, task_code, state, priority, due_at, safe_metadata
    ) values (
      p_tenant_id, p_company_id, p_profile_id, p_event_id, p_job_id, p_projection_key, p_code,
      v_normalized_state, v_normalized_priority, v_normalized_due_at,
      p_safe_metadata
    )
    on conflict (source_event_id, projection_key) do nothing
    returning id into v_id;
    if v_id is null then
      select task.id into v_id
      from public.operational_tasks as task
      where task.source_event_id = p_event_id and task.projection_key = p_projection_key
        and task.tenant_id = p_tenant_id and task.company_id = p_company_id
        and task.assigned_profile_id is not distinct from p_profile_id
        and task.task_code = p_code
        and task.state = v_normalized_state
        and task.priority = v_normalized_priority
        and task.due_at is not distinct from v_normalized_due_at
        and task.safe_metadata = p_safe_metadata;
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
        and activity.activity_code = p_code
        and activity.safe_metadata = p_safe_metadata;
    end if;
  end if;
  if v_id is null then
    raise exception using errcode = 'P3102', message = 'RUNTIME_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.operational_runtime_audit (
    operation_id, request_hash, tenant_id, company_id, source_event_id, source_job_id,
    action_code, resource_type, resource_id
  ) values (
    p_operation_id, v_request_hash, p_tenant_id, p_company_id, p_event_id, p_job_id,
    'PROJECTION_WRITTEN', p_projection_type, v_id
  );
  return pg_catalog.jsonb_build_object(
    'state', 'applied', 'projectionType', p_projection_type, 'projectionId', v_id
  );
end;
$$;

revoke all on function public.write_operational_projection(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.write_operational_projection(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text, timestamptz, jsonb
) to service_role;

commit;
