-- Revoking PUBLIC alone does not remove Supabase's explicit client-role defaults.
-- Keep these server-authorized Wave 1 mutations executable only by service_role.
revoke all on function public.mutate_cost_data(uuid, uuid, text, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_cost_data(uuid, uuid, text, uuid, bigint, jsonb)
  to service_role;

revoke all on function public.import_cost_data(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_cost_data(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.mutate_editorial_content(uuid, uuid, text, text, uuid, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.mutate_editorial_content(uuid, uuid, text, text, uuid, bigint, jsonb)
  to service_role;
