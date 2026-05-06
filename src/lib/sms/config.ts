import 'server-only';
import { decrypt } from '@/lib/crypto/pii';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { SmsProviderName } from './router';

export type UnifonicCredentials = { app_sid: string };
export type TwilioCredentials = { account_sid: string; auth_token: string };

export type TenantSmsConfig = {
  tenantId: string;
  provider: SmsProviderName;
  senderId: string;
  credentials: UnifonicCredentials | TwilioCredentials;
};

export async function resolveSmsForTenant(tenantId: string): Promise<TenantSmsConfig | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_sms_config')
    .select('tenant_id, provider, sender_id, credentials_encrypted, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data || !data.enabled) return null;
  if (data.provider !== 'unifonic' && data.provider !== 'twilio') return null;

  let credentials: UnifonicCredentials | TwilioCredentials;
  try {
    credentials = JSON.parse(decrypt(data.credentials_encrypted));
  } catch {
    return null;
  }

  return {
    tenantId: data.tenant_id,
    provider: data.provider,
    senderId: data.sender_id,
    credentials,
  };
}
