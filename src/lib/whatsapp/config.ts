import 'server-only';
import { decrypt } from '@/lib/crypto/pii';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type TenantWhatsAppConfig = {
  tenantId: string;
  businessAccountId: string;
  phoneNumberId: string;
  accessToken: string;
};

export async function resolveWhatsAppForTenant(
  tenantId: string,
): Promise<TenantWhatsAppConfig | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_whatsapp_config')
    .select('tenant_id, business_account_id, phone_number_id, access_token_encrypted, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data || !data.enabled) return null;

  return {
    tenantId: data.tenant_id,
    businessAccountId: data.business_account_id,
    phoneNumberId: data.phone_number_id,
    accessToken: decrypt(data.access_token_encrypted),
  };
}
