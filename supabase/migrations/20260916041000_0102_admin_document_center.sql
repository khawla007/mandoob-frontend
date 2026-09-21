-- Bounded, display-safe cross-workspace document oversight for platform operators.
begin;

create or replace function public.list_admin_document_center(
  p_search text,
  p_state text,
  p_doc_type text,
  p_page integer,
  p_page_size integer
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with params as materialized (
  select
    nullif(lower(trim(p_search)), '') as search_term,
    p_state as state_filter,
    p_doc_type as doc_type_filter,
    greatest(p_page, 1) as requested_page,
    least(greatest(p_page_size, 1), 25) as bounded_page_size,
    (pg_catalog.now() at time zone 'Asia/Dubai')::date as dubai_today
  where p_page between 1 and 10000
    and p_page_size between 1 and 25
    and (p_search is null or char_length(trim(p_search)) between 1 and 100)
    and p_state in ('all', 'awaiting_upload', 'under_review', 'approved', 'rejected', 'expired')
    and (
      p_doc_type is null
      or p_doc_type in (
        'passport', 'visa', 'emirates_id', 'trade_license', 'ejari', 'moa',
        'shareholder_id', 'other', 'aoa', 'bank_reference_letter', 'noc',
        'cv_resume', 'office_lease', 'medical_certificate', 'insurance_policy'
      )
    )
), request_rows as (
  select
    'request'::text as entity_kind,
    request.id as entity_id,
    tenant.name as workspace_name,
    company.company_name,
    request.doc_type,
    request.label,
    request.status as request_status,
    request.due_at,
    null::timestamptz as uploaded_at,
    null::text as review_status,
    case
      when request.doc_type = 'trade_license' then company.license_expiry
      when request.doc_type = 'visa' then employee.visa_expiry
      when request.doc_type = 'emirates_id' then employee.eid_expiry
      else null::date
    end as expires_on,
    request.created_at
  from public.document_requests request
  join public.tenants tenant on tenant.id = request.tenant_id
  join public.company_profiles company
    on company.tenant_id = request.tenant_id and company.id = request.company_id
  left join public.employees employee
    on employee.tenant_id = request.tenant_id
    and employee.company_id = request.company_id
    and employee.id = request.employee_id
  where not exists (
    select 1
    from public.documents document
    where document.tenant_id = request.tenant_id
      and document.company_id = request.company_id
      and document.request_id = request.id
  )
), document_rows as (
  select
    'document'::text as entity_kind,
    document.id as entity_id,
    tenant.name as workspace_name,
    company.company_name,
    document.doc_type,
    coalesce(document.label, request.label, document.doc_type) as label,
    request.status as request_status,
    request.due_at,
    version.created_at as uploaded_at,
    version.review_status,
    case
      when document.doc_type = 'trade_license' then company.license_expiry
      when document.doc_type = 'visa' then employee.visa_expiry
      when document.doc_type = 'emirates_id' then employee.eid_expiry
      else document.expires_on
    end as expires_on,
    document.created_at
  from public.documents document
  join public.tenants tenant on tenant.id = document.tenant_id
  join public.company_profiles company
    on company.tenant_id = document.tenant_id and company.id = document.company_id
  join public.document_versions version
    on version.tenant_id = document.tenant_id
    and version.document_id = document.id
    and version.id = document.current_version_id
  left join public.document_requests request
    on request.tenant_id = document.tenant_id
    and request.company_id = document.company_id
    and request.id = document.request_id
  left join public.employees employee
    on employee.tenant_id = document.tenant_id
    and employee.company_id = document.company_id
    and employee.id = document.employee_id
), unified as (
  select * from request_rows
  union all
  select * from document_rows
), filtered as materialized (
  select unified.*
  from unified
  cross join params
  where (params.doc_type_filter is null or unified.doc_type = params.doc_type_filter)
    and (
      params.search_term is null
      or position(params.search_term in lower(concat_ws(
        ' ', unified.workspace_name, unified.company_name, unified.label, unified.doc_type
      ))) > 0
    )
    and case params.state_filter
      when 'all' then true
      when 'awaiting_upload' then unified.entity_kind = 'request'
        and unified.request_status = 'pending'
      when 'under_review' then unified.entity_kind = 'document'
        and unified.review_status = 'pending'
      when 'approved' then unified.review_status = 'approved'
      when 'rejected' then unified.review_status = 'rejected'
      when 'expired' then unified.expires_on < params.dubai_today
      else false
    end
), totals as (
  select count(*)::integer as total from filtered
), bounds as materialized (
  select
    totals.total,
    least(
      params.requested_page,
      greatest(1, ceil(totals.total::numeric / params.bounded_page_size)::integer)
    ) as effective_page,
    params.bounded_page_size
  from totals
  cross join params
), paged as (
  select filtered.*
  from filtered
  cross join bounds
  order by filtered.created_at desc, filtered.entity_kind asc, filtered.entity_id asc
  offset (select ((effective_page - 1) * bounded_page_size) from bounds)
  limit (select bounded_page_size from bounds)
)
select pg_catalog.jsonb_build_object(
  'total', bounds.total,
  'page', bounds.effective_page,
  'rows', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'kind', paged.entity_kind,
        'workspaceName', paged.workspace_name,
        'companyName', paged.company_name,
        'docType', paged.doc_type,
        'label', paged.label,
        'requestStatus', paged.request_status,
        'dueAt', paged.due_at,
        'uploadedAt', paged.uploaded_at,
        'reviewStatus', paged.review_status,
        'expiresOn', paged.expires_on,
        'createdAt', paged.created_at
      ) order by paged.created_at desc, paged.entity_kind asc, paged.entity_id asc
    )
    from paged
  ), '[]'::jsonb)
)
from bounds;
$function$;

revoke all on function public.list_admin_document_center(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_admin_document_center(text, text, text, integer, integer)
  to service_role;

commit;
