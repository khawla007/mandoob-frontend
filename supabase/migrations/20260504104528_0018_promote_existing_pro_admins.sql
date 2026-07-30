-- One-time backfill: promote the earliest PRO user per tenant to `admin`.
-- After this migration, every tenant that has a PRO user has its original
-- `provisionTenant` invitee elevated to role 'admin'. From this point on,
-- `provisionTenant` flips the freshly-created PRO user via
-- `promoteToTenantAdmin` so new tenants inherit the same shape.
-- Source: docs/step-11-admin-role-and-team-mgmt-plan.md (sub-step 11.1).

with first_per_tenant as (
  select distinct on (tenant_id)
    id,
    tenant_id
  from public.profiles
  where role = 'pro'
    and tenant_id is not null
  order by tenant_id, created_at asc, id asc
)
update public.profiles p
set role = 'admin',
    updated_at = now()
from first_per_tenant fp
where p.id = fp.id;

-- Mirror the role flip into auth.users.app_metadata so the next JWT carries
-- the new claim. Iterate per affected user.
do $$
declare
  rec record;
begin
  for rec in
    select id from public.profiles where role = 'admin' and tenant_id is not null
  loop
    update auth.users
    set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('mandoob_role', 'admin')
    where id = rec.id;
  end loop;
end $$;
