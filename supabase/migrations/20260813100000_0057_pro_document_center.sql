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
  total_count bigint
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
  counted.total_count
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
