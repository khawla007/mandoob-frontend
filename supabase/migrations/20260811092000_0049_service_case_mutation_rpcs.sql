create or replace function public.create_service_case_with_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_client_id uuid,
  p_title text,
  p_service_type text,
  p_priority text,
  p_assigned_to uuid,
  p_due_at timestamptz,
  p_sla_due_at timestamptz,
  p_blocked_reason text,
  p_changed_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_id uuid;
begin
  insert into public.service_cases (
    tenant_id, client_id, title, service_type, priority, assigned_to,
    due_at, sla_due_at, blocked_reason, created_by
  ) values (
    p_tenant_id, p_client_id, p_title, p_service_type, p_priority, p_assigned_to,
    p_due_at, p_sla_due_at, p_blocked_reason, p_actor_id
  )
  returning id into v_case_id;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_actor_id,
    'service_case_created',
    'self_serve',
    jsonb_build_object(
      'entity', 'service_case',
      'id', v_case_id,
      'changed_keys', to_jsonb(p_changed_keys)
    )
  );

  return v_case_id;
end;
$$;

create or replace function public.update_service_case_with_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_case_id uuid,
  p_patch jsonb,
  p_changed_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_case_id uuid;
begin
  update public.service_cases
  set
    status = case when p_patch ? 'status' then p_patch ->> 'status' else status end,
    priority = case when p_patch ? 'priority' then p_patch ->> 'priority' else priority end,
    assigned_to = case
      when p_patch ? 'assigned_to' then (p_patch ->> 'assigned_to')::uuid
      else assigned_to
    end,
    due_at = case
      when p_patch ? 'due_at' then (p_patch ->> 'due_at')::timestamptz
      else due_at
    end,
    sla_due_at = case
      when p_patch ? 'sla_due_at' then (p_patch ->> 'sla_due_at')::timestamptz
      else sla_due_at
    end,
    blocked_reason = case
      when p_patch ? 'blocked_reason' then p_patch ->> 'blocked_reason'
      else blocked_reason
    end,
    completed_at = case
      when p_patch ? 'completed_at' then (p_patch ->> 'completed_at')::timestamptz
      else completed_at
    end
  where id = p_case_id
    and tenant_id = p_tenant_id
  returning id into v_case_id;

  if v_case_id is null then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_actor_id,
    'service_case_updated',
    'self_serve',
    jsonb_build_object(
      'entity', 'service_case',
      'id', v_case_id,
      'changed_keys', to_jsonb(p_changed_keys)
    )
  );

  return v_case_id;
end;
$$;

revoke all on function public.create_service_case_with_audit(
  uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_service_case_with_audit(
  uuid, uuid, uuid, text, text, text, uuid, timestamptz, timestamptz, text, text[]
) to service_role;

revoke all on function public.update_service_case_with_audit(
  uuid, uuid, uuid, jsonb, text[]
) from public, anon, authenticated;
grant execute on function public.update_service_case_with_audit(
  uuid, uuid, uuid, jsonb, text[]
) to service_role;
