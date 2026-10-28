-- P3.10 follow-up: bind notification read-state mutations to the selected Company.

drop function if exists public.set_operational_notification_read_state(uuid, boolean, uuid);

create or replace function public.set_operational_notification_read_state(
  p_company_id uuid,
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
  v_request_hash text;
begin
  if p_company_id is null or p_operation_id is null or p_read is null then
    raise exception using errcode = '22023', message = 'RUNTIME_INVALID_OPERATION';
  end if;

  select * into v_notification
  from public.operational_notifications as notification
  where notification.id = p_notification_id
    and notification.company_id = p_company_id
  for update;

  if not found or v_notification.recipient_profile_id <> v_actor_id then
    raise exception using errcode = '42501', message = 'RUNTIME_ACCESS_DENIED';
  end if;

  perform public.runtime_actor_company_access(p_company_id, true);
  v_request_hash := public.runtime_request_hash(pg_catalog.jsonb_build_object(
    'action', 'NOTIFICATION_READ_STATE_SET',
    'actorId', v_actor_id,
    'companyId', p_company_id,
    'notificationId', p_notification_id,
    'read', p_read
  ));

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 0));
  select * into v_existing
  from public.operational_runtime_audit as audit
  where audit.operation_id = p_operation_id;

  if found then
    if v_existing.action_code <> 'NOTIFICATION_READ_STATE_SET'
      or v_existing.company_id <> p_company_id
      or v_existing.resource_id <> p_notification_id
      or v_existing.actor_profile_id is distinct from v_actor_id
      or v_existing.request_hash <> v_request_hash then
      raise exception using errcode = 'P3101', message = 'RUNTIME_OPERATION_REUSED';
    end if;
    return pg_catalog.jsonb_build_object('state', 'replayed', 'notificationId', p_notification_id);
  end if;

  update public.operational_notifications
  set read_at = case when p_read then pg_catalog.now() else null end
  where id = p_notification_id
    and company_id = p_company_id;

  insert into public.operational_runtime_audit (
    operation_id, request_hash, tenant_id, company_id, actor_profile_id, source_event_id, source_job_id,
    action_code, resource_type, resource_id
  ) values (
    p_operation_id, v_request_hash, v_notification.tenant_id, p_company_id, v_actor_id,
    v_notification.source_event_id, v_notification.source_job_id,
    'NOTIFICATION_READ_STATE_SET', 'notification', p_notification_id
  );

  return pg_catalog.jsonb_build_object(
    'state', case when p_read then 'read' else 'unread' end,
    'notificationId', p_notification_id
  );
end;
$$;

revoke all on function public.set_operational_notification_read_state(uuid, uuid, boolean, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_operational_notification_read_state(uuid, uuid, boolean, uuid)
  to authenticated;
