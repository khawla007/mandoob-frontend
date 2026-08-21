-- Executable privilege contract: authenticated users may edit presentation data,
-- never license or verification evidence. Run after local migrations.
\set ON_ERROR_STOP on
set statement_timeout = '10s';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pro_profiles'
      and column_name in (
        'credentials_verified', 'license_no_encrypted',
        'verified_at', 'verified_by_profile_id'
      )
  ) then
    raise exception 'legacy PRO credential columns still exist';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.pro_profiles', 'bio', 'update'
  ) then
    raise exception 'authenticated cannot update safe PRO bio';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.pro_profiles', 'service_areas', 'update'
  ) then
    raise exception 'authenticated cannot update safe PRO service areas';
  end if;
end;
$$;
