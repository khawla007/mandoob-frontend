-- P3.07 — atomic company-scoped document request batches with durable replay.
begin;

alter table public.document_requests
  add column if not exists custom_type_label text;

alter table public.document_requests
  drop constraint if exists document_requests_custom_type_label_check;
alter table public.document_requests
  add constraint document_requests_custom_type_label_check check (
    custom_type_label is null
    or (
      doc_type = 'other'
      and char_length(custom_type_label) between 1 and 80
      and custom_type_label = btrim(custom_type_label)
      and custom_type_label !~ '[\\/[:cntrl:]]'
      and position('..' in custom_type_label) = 0
    )
  );

create table public.document_request_batch_operations (
  operation_id uuid primary key,
  tenant_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  company_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  request_ids jsonb not null check (
    jsonb_typeof(request_ids) = 'array'
    and jsonb_array_length(request_ids) between 1 and 25
  ),
  created_at timestamptz not null default clock_timestamp(),
  constraint document_request_batch_operations_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete cascade,
  constraint document_request_batch_operations_company_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id) on delete cascade
);

alter table public.document_request_batch_operations enable row level security;
revoke all on table public.document_request_batch_operations
  from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.document_requests
  from public, anon, authenticated, service_role;

create or replace function public.create_document_request_batch(
  p_operation_id uuid,
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_items jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_existing public.document_request_batch_operations%rowtype;
  v_fingerprint text;
  v_request_ids jsonb;
begin
  if p_operation_id is null or p_actor_id is null or p_tenant_id is null
    or p_company_id is null or jsonb_typeof(p_items) <> 'array'
    or not (jsonb_array_length(p_items) between 1 and 25) then
    raise exception using errcode = 'DR400', message = 'document_request_batch_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where jsonb_typeof(item.value) <> 'object'
      or not (item.value ? 'doc_type' and item.value ? 'label')
      or item.value - array['doc_type', 'custom_type_label', 'label', 'due_at', 'notes'] <> '{}'::jsonb
      or jsonb_typeof(item.value -> 'doc_type') <> 'string'
      or jsonb_typeof(item.value -> 'label') <> 'string'
      or item.value ->> 'doc_type' not in (
        'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
        'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
        'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
      )
      or char_length(item.value ->> 'label') not between 1 and 120
      or (item.value ->> 'label') <> btrim(item.value ->> 'label')
      or (item.value ? 'notes' and (
        jsonb_typeof(item.value -> 'notes') <> 'string'
        or char_length(item.value ->> 'notes') not between 1 and 500
        or (item.value ->> 'notes') <> btrim(item.value ->> 'notes')
      ))
      or (item.value ? 'due_at' and (
        jsonb_typeof(item.value -> 'due_at') <> 'string'
        or (item.value ->> 'due_at') !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(to_date(item.value ->> 'due_at', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> item.value ->> 'due_at'
      ))
      or (
        item.value ->> 'doc_type' = 'other'
        and (
          not (item.value ? 'custom_type_label')
          or jsonb_typeof(item.value -> 'custom_type_label') <> 'string'
          or char_length(item.value ->> 'custom_type_label') not between 1 and 80
          or (item.value ->> 'custom_type_label') <> btrim(item.value ->> 'custom_type_label')
          or (item.value ->> 'custom_type_label') ~ '[\\/[:cntrl:]]'
          or position('..' in item.value ->> 'custom_type_label') > 0
        )
      )
      or (item.value ->> 'doc_type' <> 'other' and item.value ? 'custom_type_label')
  ) then
    raise exception using errcode = 'DR400', message = 'document_request_batch_invalid';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_actor_id]);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  perform 1 from public.tenants
    where id = p_tenant_id and status = 'active' for share;
  if not found then
    raise exception using errcode = 'DR403', message = 'document_request_batch_forbidden';
  end if;
  perform 1 from public.profiles
    where id = p_actor_id and role = 'pro' and status = 'active' for share;
  if not found then
    raise exception using errcode = 'DR403', message = 'document_request_batch_forbidden';
  end if;
  perform 1 from public.pro_company_assignments
    where tenant_id = p_tenant_id and pro_profile_id = p_actor_id
      and company_id = p_company_id and status = 'active' for share;
  if not found then
    raise exception using errcode = 'DR403', message = 'document_request_batch_forbidden';
  end if;

  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'actor_id', p_actor_id,
    'tenant_id', p_tenant_id,
    'company_id', p_company_id,
    'items', p_items
  )::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing
  from public.document_request_batch_operations
  where operation_id = p_operation_id
  for update;
  if found then
    if v_existing.actor_id <> p_actor_id
      or v_existing.tenant_id <> p_tenant_id
      or v_existing.company_id <> p_company_id
      or v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = 'DR409', message = 'operation_id_conflict';
    end if;
    return jsonb_build_object(
      'operation_id', p_operation_id,
      'request_ids', v_existing.request_ids,
      'replayed', true
    );
  end if;

  with prepared as materialized (
    select gen_random_uuid() as id, item.value, item.ordinality
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  ), inserted as (
    insert into public.document_requests (
      id, tenant_id, company_id, requested_by, doc_type, custom_type_label,
      label, notes, due_at
    )
    select
      prepared.id, p_tenant_id, p_company_id, p_actor_id,
      prepared.value ->> 'doc_type', prepared.value ->> 'custom_type_label',
      prepared.value ->> 'label', prepared.value ->> 'notes',
      case when prepared.value ? 'due_at'
        then ((prepared.value ->> 'due_at')::date)::timestamptz else null end
    from prepared
    order by prepared.ordinality
    returning id
  )
  select jsonb_agg(prepared.id order by prepared.ordinality)
  into v_request_ids
  from prepared
  join inserted using (id);

  if jsonb_array_length(v_request_ids) <> jsonb_array_length(p_items) then
    raise exception using errcode = 'DR500', message = 'document_request_batch_failed';
  end if;

  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (
    p_tenant_id,
    p_actor_id,
    'created',
    'self_serve',
    jsonb_build_object(
      'entity', 'document_request_batch',
      'operation_id', p_operation_id,
      'company_id', p_company_id,
      'request_ids', v_request_ids,
      'request_count', jsonb_array_length(v_request_ids)
    )
  );

  insert into public.document_request_batch_operations (
    operation_id, tenant_id, actor_id, company_id, request_fingerprint, request_ids
  ) values (
    p_operation_id, p_tenant_id, p_actor_id, p_company_id, v_fingerprint, v_request_ids
  );

  return jsonb_build_object(
    'operation_id', p_operation_id,
    'request_ids', v_request_ids,
    'replayed', false
  );
end;
$function$;

alter function public.create_document_request_batch(uuid, uuid, uuid, uuid, jsonb)
  owner to postgres;

revoke all on function public.create_document_request_batch(uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_document_request_batch(uuid, uuid, uuid, uuid, jsonb)
  to service_role;

commit;
