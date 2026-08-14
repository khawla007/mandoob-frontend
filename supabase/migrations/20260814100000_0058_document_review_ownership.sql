-- Atomic, ownership-safe PRO document review.
-- The service-role DAL calls this RPC because service-role access bypasses RLS;
-- every tenant discriminator and relationship edge is therefore revalidated
-- while the affected rows are locked in one database transaction.

create or replace function public.review_document_version(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_version_id uuid,
  p_status text,
  p_note text,
  p_reviewed_at timestamptz
) returns table (
  document_id uuid,
  client_id uuid,
  fulfilled_request_id uuid,
  review_status text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id uuid;
  v_version_tenant_id uuid;
  v_version_document_id uuid;
  v_document_id uuid;
  v_document_tenant_id uuid;
  v_document_client_id uuid;
  v_request_id uuid;
  v_client_id uuid;
  v_client_tenant_id uuid;
  v_request_tenant_id uuid;
  v_request_client_id uuid;
  v_request_status text;
  v_updated_version_id uuid;
  v_updated_document_id uuid;
  v_fulfilled_request_id uuid;
begin
  perform 1
  from public.tenants
  where id = p_tenant_id
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  perform 1
  from public.profiles
  where id = p_actor_id
    and tenant_id = p_tenant_id
    and role = 'pro'
    and status = 'active'
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select
    v.id,
    v.tenant_id,
    v.document_id,
    d.id,
    d.tenant_id,
    d.client_id,
    d.request_id,
    c.id,
    c.tenant_id
  into
    v_version_id,
    v_version_tenant_id,
    v_version_document_id,
    v_document_id,
    v_document_tenant_id,
    v_document_client_id,
    v_request_id,
    v_client_id,
    v_client_tenant_id
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  join public.clients c on c.id = d.client_id
  where v.id = p_version_id
  for update of v, d, c;

  if not found then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  if v_version_tenant_id <> p_tenant_id
    or v_document_tenant_id <> p_tenant_id
    or v_client_tenant_id <> p_tenant_id
    or v_version_document_id <> v_document_id
    or v_document_client_id <> v_client_id then
    raise exception using errcode = 'MD404', message = 'document_version_not_found';
  end if;

  if v_request_id is not null then
    select r.tenant_id, r.client_id, r.status
    into v_request_tenant_id, v_request_client_id, v_request_status
    from public.document_requests r
    where r.id = v_request_id
    for update of r;

    if not found
      or v_request_tenant_id <> p_tenant_id
      or v_request_client_id <> v_document_client_id then
      raise exception using errcode = 'MD404', message = 'document_version_not_found';
    end if;
  end if;

  if p_status is null
    or p_status not in ('approved', 'rejected') then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;
  if p_status = 'rejected'
    and regexp_replace(coalesce(p_note, ''), '[[:space:]]', '', 'g') = '' then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 280 then
    raise exception using errcode = 'MD422', message = 'invalid_review';
  end if;

  update public.document_versions v
  set
    review_status = p_status,
    review_note = case when p_note is null then null else btrim(p_note) end,
    reviewed_by = p_actor_id,
    reviewed_at = p_reviewed_at
  where v.id = p_version_id
    and v.tenant_id = p_tenant_id
    and v.document_id = v_document_id
  returning v.id into v_updated_version_id;

  if v_updated_version_id is null then
    raise exception using errcode = 'P0001', message = 'document_review_update_failed';
  end if;

  if p_status = 'approved' then
    update public.documents d
    set
      current_version_id = p_version_id,
      updated_at = p_reviewed_at
    where d.id = v_document_id
      and d.tenant_id = p_tenant_id
      and d.client_id = v_document_client_id
    returning d.id into v_updated_document_id;

    if v_updated_document_id is null then
      raise exception using errcode = 'P0001', message = 'document_head_update_failed';
    end if;

    if v_request_id is not null and v_request_status = 'pending' then
      update public.document_requests r
      set
        status = 'fulfilled',
        updated_at = p_reviewed_at
      where r.id = v_request_id
        and r.tenant_id = p_tenant_id
        and r.client_id = v_document_client_id
        and r.status = 'pending'
      returning r.id into v_fulfilled_request_id;

      if v_fulfilled_request_id is null then
        raise exception using errcode = 'P0001', message = 'document_request_update_failed';
      end if;
    elsif v_request_id is not null and v_request_status = 'fulfilled' then
      v_fulfilled_request_id := v_request_id;
    elsif v_request_status = 'cancelled' then
      v_fulfilled_request_id := null;
    end if;
  end if;

  insert into public.tenant_audit_log (
    tenant_id, actor_id, action, source, details
  ) values (
    p_tenant_id,
    p_actor_id,
    'updated',
    'self_serve',
    jsonb_build_object(
      'entity', 'document',
      'op', 'review',
      'version_id', p_version_id,
      'document_id', v_document_id,
      'review_status', p_status,
      'fulfilled_request_id', v_fulfilled_request_id
    )
  );

  return query select
    v_document_id,
    v_document_client_id,
    v_fulfilled_request_id,
    p_status;
end;
$function$;

revoke all on function public.review_document_version(
  uuid, uuid, uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.review_document_version(
  uuid, uuid, uuid, text, text, timestamptz
) to service_role;
