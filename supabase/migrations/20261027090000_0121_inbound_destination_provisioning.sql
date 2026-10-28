-- P3.13: provision or re-key opaque inbound destinations without exposing plaintext keys.

create function public.provision_inbound_destination(
  p_provider text,
  p_tenant_id uuid,
  p_company_id uuid,
  p_destination_id uuid,
  p_destination_key_hash text,
  p_enabled boolean,
  p_readiness_approved boolean,
  p_operation_id uuid,
  p_correlation_id uuid
)
returns table (
  destination_id uuid,
  enabled boolean,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destination public.inbound_destinations%rowtype;
  v_enabled boolean := coalesce(p_enabled, false);
  v_mode text;
  v_replay_target text;
begin
  if p_provider is null
    or p_provider not in ('twilio', 'unifonic', 'whatsapp')
    or p_destination_key_hash is null
    or p_destination_key_hash !~ '^v1:[a-f0-9]{64}$'
    or p_tenant_id is null
    or p_operation_id is null
    or p_correlation_id is null
  then
    raise exception using errcode = '23514', message = 'INVALID_INBOUND_DESTINATION_PROVISIONING';
  end if;

  if v_enabled and p_readiness_approved is not true then
    raise exception using errcode = '23514', message = 'INBOUND_DESTINATION_READINESS_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.tenants tenant
    where tenant.id = p_tenant_id
      and tenant.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'INBOUND_DESTINATION_TENANT_INVALID';
  end if;

  if p_company_id is not null and not exists (
    select 1
    from public.company_profiles company
    where company.id = p_company_id
      and company.tenant_id = p_tenant_id
      and company.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'INBOUND_DESTINATION_COMPANY_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_operation_id::text, 0)
  );

  select audit.target_opaque_id
  into v_replay_target
  from public.platform_audit_events audit
  where audit.event_name = 'integration.inbound_destination_provisioned'
    and audit.operation_id = p_operation_id;

  if v_replay_target is not null then
    select destination.*
    into v_destination
    from public.inbound_destinations destination
    where destination.id = v_replay_target::uuid;

    if not found
      or v_destination.provider <> p_provider
      or v_destination.tenant_id <> p_tenant_id
      or v_destination.company_id is distinct from p_company_id
      or v_destination.destination_key_hash <> p_destination_key_hash
      or v_destination.enabled <> v_enabled
    then
      raise exception using errcode = '23514', message = 'OPERATION_REPLAY_MISMATCH';
    end if;

    return query select v_destination.id, v_destination.enabled, true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_destination_key_hash, 0)
  );

  select destination.*
  into v_destination
  from public.inbound_destinations destination
  where destination.provider = p_provider
    and destination.destination_key_hash = p_destination_key_hash;

  if found and (
    v_destination.tenant_id <> p_tenant_id
    or v_destination.company_id is distinct from p_company_id
    or (p_destination_id is not null and v_destination.id <> p_destination_id)
  ) then
    raise exception using errcode = '23514', message = 'INBOUND_DESTINATION_OWNERSHIP_MISMATCH';
  end if;

  if p_destination_id is not null then
    select destination.*
    into v_destination
    from public.inbound_destinations destination
    where destination.id = p_destination_id
    for update;

    if not found
      or v_destination.provider <> p_provider
      or v_destination.tenant_id <> p_tenant_id
      or v_destination.company_id is distinct from p_company_id
    then
      raise exception using errcode = '23514', message = 'INBOUND_DESTINATION_OWNERSHIP_MISMATCH';
    end if;

    update public.inbound_destinations destination
    set destination_key_hash = p_destination_key_hash,
        enabled = v_enabled,
        updated_at = pg_catalog.now()
    where destination.id = p_destination_id
    returning destination.* into v_destination;
    v_mode := 'rekey';
  elsif v_destination.id is not null then
    update public.inbound_destinations destination
    set enabled = v_enabled,
        updated_at = pg_catalog.now()
    where destination.id = v_destination.id
    returning destination.* into v_destination;
    v_mode := 'provision';
  else
    insert into public.inbound_destinations (
      provider,
      destination_key_hash,
      tenant_id,
      company_id,
      enabled
    ) values (
      p_provider,
      p_destination_key_hash,
      p_tenant_id,
      p_company_id,
      v_enabled
    )
    returning * into v_destination;
    v_mode := 'provision';
  end if;

  insert into public.platform_audit_events (
    event_name,
    tenant_id,
    action,
    target_type,
    target_opaque_id,
    outcome,
    reason_code,
    operation_id,
    correlation_id,
    source_class,
    safe_metadata
  ) values (
    'integration.inbound_destination_provisioned',
    p_tenant_id,
    'provision_inbound_destination',
    'inbound_destination',
    v_destination.id::text,
    'success',
    case when v_mode = 'rekey' then 'DESTINATION_REKEYED' else 'DESTINATION_PROVISIONED' end,
    p_operation_id,
    p_correlation_id,
    'system',
    pg_catalog.jsonb_build_object(
      'provider', p_provider,
      'enabled', v_enabled,
      'mode', v_mode
    )
  );

  return query select v_destination.id, v_destination.enabled, false;
end;
$$;

revoke all on function public.provision_inbound_destination(
  text, uuid, uuid, uuid, text, boolean, boolean, uuid, uuid
) from public, anon, authenticated, service_role;

grant execute on function public.provision_inbound_destination(
  text, uuid, uuid, uuid, text, boolean, boolean, uuid, uuid
) to service_role;
