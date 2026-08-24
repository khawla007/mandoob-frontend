\set ON_ERROR_STOP on
begin;

delete from public.pro_assignment_term_links links
using public.pro_company_assignments assignments
where links.assignment_id = assignments.id
  and (assignments.company_id in (
    '95000000-0000-4000-8000-000000000031','95000000-0000-4000-8000-000000000032',
    '95000000-0000-4000-8000-000000000033','95000000-0000-4000-8000-000000000034',
    '95000000-0000-4000-8000-000000000035','95000000-0000-4000-8000-000000000036'
  ) or assignments.pro_profile_id in (
    select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
    from pg_catalog.generate_series(11, 17) value
  ));
delete from public.pro_company_assignments where company_id in (
  '95000000-0000-4000-8000-000000000031','95000000-0000-4000-8000-000000000032',
  '95000000-0000-4000-8000-000000000033','95000000-0000-4000-8000-000000000034',
  '95000000-0000-4000-8000-000000000035','95000000-0000-4000-8000-000000000036'
) or pro_profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from public.tenant_audit_log where tenant_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(21, 26) value
) or actor_id in (
  '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002'
);
delete from public.pro_credentials where pro_profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from public.pro_commercial_terms where pro_profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from public.company_profiles where id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(31, 36) value
);
delete from public.tenants where id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(21, 26) value
);
delete from public.pro_profiles where profile_id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from public.profiles where id in (
  '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002'
) or id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
delete from auth.users where id in (
  '95000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002'
) or id in (
  select ('95000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid
  from pg_catalog.generate_series(11, 17) value
);
commit;
