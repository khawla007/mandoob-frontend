do $$
begin
  if not pg_catalog.has_column_privilege('authenticated', 'public.pro_profiles', 'designation', 'UPDATE')
    or not pg_catalog.has_column_privilege('authenticated', 'public.pro_profiles', 'department', 'UPDATE')
    or not pg_catalog.has_column_privilege('authenticated', 'public.pro_profiles', 'service_areas', 'UPDATE')
    or not pg_catalog.has_column_privilege('authenticated', 'public.pro_profiles', 'bio', 'UPDATE')
  then
    raise exception '0085 did not grant all intended PRO self-update columns';
  end if;
end;
$$;
