-- Seed: sample tenant. User creation happens in scripts/seed-auth.ts
-- (Supabase Auth admin API, requires SUPABASE_SERVICE_ROLE_KEY).

insert into public.tenants (id, slug, name, plan, status)
values ('00000000-0000-0000-0000-000000000001', 'firm', 'Firm PRO Services', 'starter', 'active')
on conflict (slug) do nothing;
