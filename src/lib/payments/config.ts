import 'server-only';
import { decrypt } from '@/lib/crypto/pii';
import { env } from '@/lib/env';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type ResolvedTapConfig = {
  source: 'tenant' | 'platform';
  tenantId: string | null;
  merchantId: string | null;
  secretKey: string;
  webhookSecret: string;
  apiBase: string;
  enabled: boolean;
};

const DEFAULT_API_BASE = 'https://api.tap.company';

export async function resolveTenantTapConfig(tenantId: string): Promise<ResolvedTapConfig | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('tenant_payment_config')
    .select('merchant_id, secret_encrypted, webhook_secret_encrypted, enabled')
    .eq('tenant_id', tenantId)
    .eq('provider', 'tap')
    .maybeSingle();

  if (data) {
    return {
      source: 'tenant',
      tenantId,
      merchantId: data.merchant_id,
      secretKey: decrypt(data.secret_encrypted),
      webhookSecret: decrypt(data.webhook_secret_encrypted),
      apiBase: env.TAP_API_BASE ?? DEFAULT_API_BASE,
      enabled: data.enabled,
    };
  }

  if (env.TAP_SECRET_KEY && env.TAP_WEBHOOK_SECRET) {
    return {
      source: 'platform',
      tenantId: null,
      merchantId: null,
      secretKey: env.TAP_SECRET_KEY,
      webhookSecret: env.TAP_WEBHOOK_SECRET,
      apiBase: env.TAP_API_BASE ?? DEFAULT_API_BASE,
      enabled: true,
    };
  }

  return null;
}
