begin;

alter type public.auth_event_kind add value if not exists 'profile_self_edited';

revoke update on table public.pro_profiles from public, anon, authenticated;
grant update (
  designation, department, service_areas, bio
) on table public.pro_profiles to authenticated;

commit;
