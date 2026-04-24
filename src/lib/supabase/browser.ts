import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env.public';

let cached: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!cached) {
    cached = createBrowserClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return cached;
}
