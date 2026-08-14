-- 0057_pro_document_center.sql
-- Tenant-scoped document-center read model and supporting schema.

alter table public.documents
  add column if not exists expires_on date;

alter table public.documents
  drop constraint if exists documents_doc_type_check;
alter table public.documents
  add constraint documents_doc_type_check check (doc_type in (
    'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
    'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
    'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
  ));

alter table public.document_requests
  drop constraint if exists document_requests_doc_type_check;
alter table public.document_requests
  add constraint document_requests_doc_type_check check (doc_type in (
    'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
    'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
    'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
  ));

create index if not exists documents_tenant_expiry_idx
  on public.documents (tenant_id, expires_on, id)
  where expires_on is not null;

create index if not exists document_requests_tenant_status_due_idx
  on public.document_requests (tenant_id, status, due_at, id);

create index if not exists document_versions_document_created_id_idx
  on public.document_versions (document_id, created_at desc, id desc);

create or replace function public.list_pro_document_center(
  p_tenant_id uuid,
  p_view text default 'all',
  p_search text default null,
  p_client_id uuid default null,
  p_doc_type text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_expiry_from date default null,
  p_expiry_to date default null,
  p_sort text default 'urgency',
  p_focus_kind text default null,
  p_focus_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 50
) returns table (
  entity_kind text,
  entity_id uuid,
  tenant_id uuid,
  client_id uuid,
  client_name text,
  client_status text,
  employee_id uuid,
  employee_name text,
  doc_type text,
  label text,
  request_id uuid,
  request_status text,
  due_at timestamptz,
  requested_by uuid,
  requested_by_name text,
  document_id uuid,
  current_version_id uuid,
  current_version_created_at timestamptz,
  current_version_mime_type text,
  current_version_size_bytes bigint,
  review_status text,
  review_note text,
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  effective_expires_on date,
  expiry_source text,
  created_at timestamptz,
  total_count bigint,
  effective_page integer
)
language sql
stable
security invoker
as $function$
with params as materialized (
  select
    coalesce(p_view, 'all') as view_name,
    nullif(lower(trim(p_search)), '') as search_term,
    p_client_id as client_filter,
    p_doc_type as doc_type_filter,
    p_due_from as due_from,
    p_due_to as due_to,
    p_expiry_from as expiry_from,
    p_expiry_to as expiry_to,
    coalesce(p_sort, 'urgency') as sort_name,
    p_focus_kind as focus_kind,
    p_focus_id as focus_id,
    (now() at time zone 'Asia/Dubai')::date as dubai_today
  where coalesce(p_view, 'all') in (
      'all', 'requested', 'submitted', 'approved', 'rejected', 'expiring', 'overdue'
    )
    and (
      p_doc_type is null
      or p_doc_type in (
        'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
        'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
        'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
      )
    )
    and coalesce(p_sort, 'urgency') in (
      'urgency', 'newest', 'oldest', 'due_date', 'expiry_date'
    )
    and (p_due_from is null or p_due_to is null or p_due_from <= p_due_to)
    and (p_expiry_from is null or p_expiry_to is null or p_expiry_from <= p_expiry_to)
    and (
      (p_focus_kind is null and p_focus_id is null)
      or (p_focus_kind in ('request', 'document') and p_focus_id is not null)
    )
    and p_page is not null
    and p_page_size is not null
), request_rows as (
  select
    'request'::text as entity_kind,
    r.id as entity_id,
    c.tenant_id,
    c.id as client_id,
    c.company_name as client_name,
    c.status::text as client_status,
    r.employee_id,
    e.name as employee_name,
    r.doc_type,
    r.label,
    r.id as request_id,
    r.status as request_status,
    r.due_at,
    r.requested_by,
    requester.full_name as requested_by_name,
    null::uuid as document_id,
    null::uuid as current_version_id,
    null::timestamptz as current_version_created_at,
    null::text as current_version_mime_type,
    null::bigint as current_version_size_bytes,
    null::text as review_status,
    null::text as review_note,
    null::uuid as reviewed_by,
    null::text as reviewed_by_name,
    null::timestamptz as reviewed_at,
    case
      when r.doc_type = 'trade_license' then c.license_expiry
      when r.doc_type = 'visa' and r.employee_id is not null then e.visa_expiry
      when r.doc_type = 'emirates_id' and r.employee_id is not null then e.eid_expiry
      else null::date
    end as effective_expires_on,
    case
      when r.doc_type = 'trade_license' then 'client_license'
      when r.doc_type = 'visa' and r.employee_id is not null then 'employee_visa'
      when r.doc_type = 'emirates_id' and r.employee_id is not null then 'employee_emirates_id'
      else null::text
    end as expiry_source,
    r.created_at
  from public.clients c
  join public.document_requests r on r.client_id = c.id and r.tenant_id = c.tenant_id
  left join public.employees e on e.id = r.employee_id
    and e.tenant_id = c.tenant_id and e.client_id = c.id
  left join public.profiles requester on requester.id = r.requested_by
    and requester.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant_id
    and r.status = 'pending'
    and not exists (
      select 1
      from public.documents existing
      where existing.request_id = r.id
        and existing.tenant_id = c.tenant_id
        and existing.client_id = c.id
    )
), document_rows as (
  select
    'document'::text as entity_kind,
    d.id as entity_id,
    c.tenant_id,
    c.id as client_id,
    c.company_name as client_name,
    c.status::text as client_status,
    d.employee_id,
    e.name as employee_name,
    d.doc_type,
    coalesce(d.label, request.label, d.doc_type) as label,
    request.id as request_id,
    request.status as request_status,
    request.due_at,
    request.requested_by,
    requester.full_name as requested_by_name,
    d.id as document_id,
    version.id as current_version_id,
    version.created_at as current_version_created_at,
    version.mime_type as current_version_mime_type,
    version.size_bytes as current_version_size_bytes,
    version.review_status,
    version.review_note,
    version.reviewed_by,
    reviewer.full_name as reviewed_by_name,
    version.reviewed_at,
    case
      when d.doc_type = 'trade_license' then c.license_expiry
      when d.doc_type = 'visa' and d.employee_id is not null then e.visa_expiry
      when d.doc_type = 'emirates_id' and d.employee_id is not null then e.eid_expiry
      else d.expires_on
    end as effective_expires_on,
    case
      when d.doc_type = 'trade_license' then 'client_license'
      when d.doc_type = 'visa' and d.employee_id is not null then 'employee_visa'
      when d.doc_type = 'emirates_id' and d.employee_id is not null then 'employee_emirates_id'
      else 'document'
    end as expiry_source,
    d.created_at
  from public.clients c
  join public.documents d on d.client_id = c.id and d.tenant_id = c.tenant_id
  left join public.employees e on e.id = d.employee_id
    and e.tenant_id = c.tenant_id and e.client_id = c.id
  left join public.document_requests request on request.id = d.request_id
    and request.tenant_id = c.tenant_id and request.client_id = c.id
  left join public.profiles requester on requester.id = request.requested_by
    and requester.tenant_id = c.tenant_id
  left join public.document_versions version on version.id = d.current_version_id
    and version.document_id = d.id and version.tenant_id = c.tenant_id
  left join public.profiles reviewer on reviewer.id = version.reviewed_by
    and reviewer.tenant_id = c.tenant_id
  where c.tenant_id = p_tenant_id
), unified as (
  select * from request_rows
  union all
  select * from document_rows
), filtered as materialized (
  select unified.*
  from unified
  cross join params
  where (params.client_filter is null or unified.client_id = params.client_filter)
    and (params.doc_type_filter is null or unified.doc_type = params.doc_type_filter)
    and (
      params.search_term is null
      or position(params.search_term in lower(concat_ws(
        ' ', unified.client_name, unified.employee_name, unified.label, unified.doc_type,
        unified.requested_by_name, unified.reviewed_by_name
      ))) > 0
    )
    and (
      params.due_from is null
      or (unified.due_at at time zone 'Asia/Dubai')::date >= params.due_from
    )
    and (
      params.due_to is null
      or (unified.due_at at time zone 'Asia/Dubai')::date <= params.due_to
    )
    and (
      params.expiry_from is null
      or unified.effective_expires_on >= params.expiry_from
    )
    and (
      params.expiry_to is null
      or unified.effective_expires_on <= params.expiry_to
    )
    and (
      params.focus_kind is null
      or (unified.entity_kind = params.focus_kind and unified.entity_id = params.focus_id)
    )
    and case params.view_name
      when 'all' then true
      when 'requested' then unified.entity_kind = 'request'
      when 'submitted' then unified.entity_kind = 'document' and unified.review_status = 'pending'
      when 'approved' then unified.review_status = 'approved'
      when 'rejected' then unified.review_status = 'rejected'
      when 'expiring' then unified.effective_expires_on between params.dubai_today and params.dubai_today + 30
      when 'overdue' then unified.entity_kind = 'request'
        and (unified.due_at at time zone 'Asia/Dubai')::date < params.dubai_today
      else false
    end
), counted as materialized (
  select filtered.*, count(*) over() as total_count
  from filtered
), page_bounds as materialized (
  select coalesce(
    least(
      greatest(p_page, 1),
      ceil(
        max(counted.total_count)::numeric
        / least(greatest(p_page_size, 1), 50)
      )::integer
    ),
    1
  ) as effective_page
  from counted
)
select
  counted.entity_kind,
  counted.entity_id,
  counted.tenant_id,
  counted.client_id,
  counted.client_name,
  counted.client_status,
  counted.employee_id,
  counted.employee_name,
  counted.doc_type,
  counted.label,
  counted.request_id,
  counted.request_status,
  counted.due_at,
  counted.requested_by,
  counted.requested_by_name,
  counted.document_id,
  counted.current_version_id,
  counted.current_version_created_at,
  counted.current_version_mime_type,
  counted.current_version_size_bytes,
  counted.review_status,
  counted.review_note,
  counted.reviewed_by,
  counted.reviewed_by_name,
  counted.reviewed_at,
  counted.effective_expires_on,
  counted.expiry_source,
  counted.created_at,
  counted.total_count,
  (select effective_page from page_bounds) as effective_page
from counted
cross join params
order by
  case when params.sort_name = 'urgency' then case
    when counted.entity_kind = 'request'
      and (counted.due_at at time zone 'Asia/Dubai')::date < params.dubai_today then 0
    when counted.entity_kind = 'document'
      and counted.effective_expires_on < params.dubai_today then 1
    when counted.entity_kind = 'request' and counted.due_at is not null then 2
    when counted.entity_kind = 'document' and counted.effective_expires_on is not null then 3
    else 4
  end end asc,
  case when params.sort_name = 'urgency' and counted.entity_kind = 'request'
    then counted.due_at end asc nulls last,
  case when params.sort_name = 'urgency' and counted.entity_kind = 'document'
    then counted.effective_expires_on end asc nulls last,
  case when params.sort_name = 'newest' then counted.created_at end desc,
  case when params.sort_name = 'oldest' then counted.created_at end asc,
  case when params.sort_name = 'due_date' then counted.due_at end asc nulls last,
  case when params.sort_name = 'expiry_date' then counted.effective_expires_on end asc nulls last,
  counted.entity_kind asc, counted.entity_id asc
limit least(greatest(p_page_size, 1), 50)
offset (((select effective_page from page_bounds) - 1)
  * least(greatest(p_page_size, 1), 50));
$function$;

revoke all on function public.list_pro_document_center(
  uuid, text, text, uuid, text, date, date, date, date, text, text, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_pro_document_center(
  uuid, text, text, uuid, text, date, date, date, date, text, text, uuid, integer, integer
) to service_role;

create or replace function public.get_pro_document_version_history(
  p_tenant_id uuid,
  p_document_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with owned as materialized (
  select
    d.id as document_id,
    d.tenant_id,
    d.current_version_id
  from public.documents d
  join public.clients c
    on c.id = d.client_id
    and c.tenant_id = d.tenant_id
  where d.id = p_document_id
    and d.tenant_id = p_tenant_id
    and c.tenant_id = p_tenant_id
), ranked as materialized (
  select
    v.id as version_id,
    owned.current_version_id,
    v.created_at,
    v.uploaded_by,
    uploader.full_name as uploader_name,
    v.review_status,
    v.reviewed_by,
    reviewer.full_name as reviewer_name,
    v.reviewed_at,
    v.review_note,
    v.size_bytes,
    v.mime_type,
    count(*) over() as total,
    row_number() over (order by v.created_at desc, v.id desc) as newest_rank
  from owned
  join public.document_versions v
    on v.document_id = owned.document_id
    and v.tenant_id = owned.tenant_id
  left join public.profiles uploader
    on uploader.id = v.uploaded_by
    and uploader.tenant_id = owned.tenant_id
  left join public.profiles reviewer
    on reviewer.id = v.reviewed_by
    and reviewer.tenant_id = owned.tenant_id
), versions as (
  select
    max(ranked.total) as total,
    jsonb_agg(
      jsonb_build_object(
        'versionId', ranked.version_id,
        'versionNumber', ranked.total - ranked.newest_rank + 1,
        'current', coalesce(ranked.version_id = ranked.current_version_id, false),
        'uploadedAt', ranked.created_at,
        'uploadedBy', ranked.uploaded_by,
        'uploaderName', ranked.uploader_name,
        'reviewStatus', ranked.review_status,
        'reviewedBy', ranked.reviewed_by,
        'reviewerName', ranked.reviewer_name,
        'reviewedAt', ranked.reviewed_at,
        'reviewNote', ranked.review_note,
        'sizeBytes', ranked.size_bytes,
        'mimeType', ranked.mime_type
      )
      order by ranked.created_at desc, ranked.version_id desc
    ) as items
  from ranked
)
select jsonb_build_object(
  'documentId', owned.document_id,
  'currentVersionId', owned.current_version_id,
  'total', coalesce(versions.total, 0),
  'versions', coalesce(versions.items, '[]'::jsonb)
)
from owned
cross join versions;
$function$;

revoke all on function public.get_pro_document_version_history(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.get_pro_document_version_history(
  uuid, uuid
) to service_role;

create or replace function public.set_pro_document_expiry(
  p_tenant_id uuid,
  p_document_id uuid,
  p_actor_id uuid,
  p_expires_on date
) returns table (
  document_id uuid,
  client_id uuid,
  expires_on date
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_document_id uuid;
  v_document_tenant_id uuid;
  v_document_client_id uuid;
  v_document_doc_type text;
  v_document_employee_id uuid;
  v_client_id uuid;
  v_client_tenant_id uuid;
  v_employee_id uuid;
  v_employee_tenant_id uuid;
  v_employee_client_id uuid;
  v_updated_id uuid;
  v_updated_expires_on date;
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
    d.id,
    d.tenant_id,
    d.client_id,
    d.doc_type,
    d.employee_id,
    c.id,
    c.tenant_id
  into
    v_document_id,
    v_document_tenant_id,
    v_document_client_id,
    v_document_doc_type,
    v_document_employee_id,
    v_client_id,
    v_client_tenant_id
  from public.documents d
  join public.clients c on c.id = d.client_id
  where d.id = p_document_id
  for update of d, c;

  if not found then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  if v_document_tenant_id <> p_tenant_id
    or v_client_tenant_id <> p_tenant_id
    or v_document_client_id <> v_client_id then
    raise exception using errcode = 'MD404', message = 'document_not_found';
  end if;

  if v_document_employee_id is not null then
    select e.id, e.tenant_id, e.client_id
    into v_employee_id, v_employee_tenant_id, v_employee_client_id
    from public.employees e
    where e.id = v_document_employee_id
    for share of e;

    if not found
      or v_employee_tenant_id <> p_tenant_id
      or v_employee_client_id <> v_document_client_id then
      raise exception using errcode = 'MD404', message = 'document_not_found';
    end if;
  end if;

  if v_document_doc_type = 'trade_license'
    or (
      v_document_employee_id is not null
      and v_document_doc_type in ('visa', 'emirates_id')
    ) then
    raise exception using errcode = 'MD409', message = 'expiry_externally_managed';
  end if;

  update public.documents d
  set expires_on = p_expires_on
  where d.id = v_document_id
    and d.tenant_id = p_tenant_id
  returning d.id, d.expires_on into v_updated_id, v_updated_expires_on;

  if not found then
    raise exception using errcode = 'P0001', message = 'document_update_failed';
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
      'op', 'set_expiry',
      'document_id', v_updated_id,
      'expires_on', v_updated_expires_on
    )
  );

  return query select v_updated_id, v_document_client_id, v_updated_expires_on;
end;
$function$;

revoke all on function public.set_pro_document_expiry(
  uuid, uuid, uuid, date
) from public, anon, authenticated;
grant execute on function public.set_pro_document_expiry(
  uuid, uuid, uuid, date
) to service_role;
