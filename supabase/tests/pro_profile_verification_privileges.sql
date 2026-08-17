-- Executable privilege contract: authenticated users may edit presentation data,
-- never license or verification evidence. Run after local migrations.
do $$
begin
  if has_column_privilege(
    'authenticated', 'public.pro_profiles', 'credentials_verified', 'update'
  ) then
    raise exception 'authenticated can update credentials_verified';
  end if;
  if has_column_privilege(
    'authenticated', 'public.pro_profiles', 'license_no_encrypted', 'update'
  ) then
    raise exception 'authenticated can update license_no_encrypted';
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
