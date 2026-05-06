import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

const DAILY_CAPACITY = 200;
const REFILL_PER_SEC = DAILY_CAPACITY / 86_400;

export async function consumeWhatsAppQuota(tenantId: string): Promise<{ ok: boolean }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc('rate_limit_consume', {
    p_key: `wa:${tenantId}`,
    p_capacity: DAILY_CAPACITY,
    p_cost: 1,
    p_refill_per_sec: REFILL_PER_SEC,
  });
  if (error) return { ok: false };
  return { ok: data === true };
}
