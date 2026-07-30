-- 0021_renewals_revoke_security_definer.sql
-- Step 15 follow-up — lock down SECURITY DEFINER functions added in 0020.
--
-- recompute_renewal_status   — only the pg_cron job (postgres role) needs it.
-- renewals_sync_from_license — only fires from the AFTER trigger on clients;
--                              never invoked via /rest/v1/rpc.
--
-- Revoke from public/anon/authenticated so the Supabase security linter is
-- clean (lint codes 0028 + 0029).

revoke execute on function public.recompute_renewal_status() from public, anon, authenticated;
revoke execute on function public.renewals_sync_from_license() from public, anon, authenticated;
