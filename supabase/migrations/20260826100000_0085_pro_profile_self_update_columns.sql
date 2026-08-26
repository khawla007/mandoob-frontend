begin;

revoke update on table public.pro_profiles from public, anon, authenticated;
grant update (
  designation, department, service_areas, bio
) on table public.pro_profiles to authenticated;

commit;
