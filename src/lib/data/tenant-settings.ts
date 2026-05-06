import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type TenantBranding = {
  name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

export type TenantContact = {
  email_sender_name: string | null;
  email_reply_to: string | null;
  terms_url: string | null;
  privacy_url: string | null;
};

export type TenantSmtpRedacted = {
  host: string;
  port: number;
  username: string;
  from_address: string;
  enabled: boolean;
  has_password: boolean;
} | null;

export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('tenants')
    .select('name, logo_url, favicon_url, primary_color, secondary_color')
    .eq('id', tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name as string,
    logo_url: (data.logo_url as string | null) ?? null,
    favicon_url: (data.favicon_url as string | null) ?? null,
    primary_color: (data.primary_color as string | null) ?? null,
    secondary_color: (data.secondary_color as string | null) ?? null,
  };
}

export async function getTenantContact(tenantId: string): Promise<TenantContact | null> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('tenants')
    .select('email_sender_name, email_reply_to, terms_url, privacy_url')
    .eq('id', tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    email_sender_name: (data.email_sender_name as string | null) ?? null,
    email_reply_to: (data.email_reply_to as string | null) ?? null,
    terms_url: (data.terms_url as string | null) ?? null,
    privacy_url: (data.privacy_url as string | null) ?? null,
  };
}

// Returns SMTP config without the encrypted password (UI only sees has_password).
export async function getTenantSmtpRedacted(tenantId: string): Promise<TenantSmtpRedacted> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('tenant_smtp_config')
    .select('host, port, username, from_address, enabled, password_encrypted')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    host: data.host as string,
    port: data.port as number,
    username: data.username as string,
    from_address: data.from_address as string,
    enabled: data.enabled as boolean,
    has_password: Boolean(data.password_encrypted),
  };
}
