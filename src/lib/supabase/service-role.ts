import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Service-role client. BYPASSES RLS.
 * Use only for: auth admin ops, seeding, webhooks, cross-tenant super-admin flows.
 * Never expose to the browser. Importing this from a Client Component fails at build.
 */
export function createSupabaseServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
