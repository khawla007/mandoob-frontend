import 'server-only';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { SourceState } from '@/lib/settings/provider-state';

export type TenantBranding = {
  name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  terms_url?: string | null;
  privacy_url?: string | null;
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

export type TenantWhatsAppRedacted = {
  phone_number_id: string;
  business_account_id: string;
  enabled: boolean;
  has_access_token: boolean;
} | null;

export type TenantSettingsSnapshot = {
  branding: SourceState<TenantBranding | null>;
  contact: SourceState<TenantContact | null>;
  smtp: SourceState<TenantSmtpRedacted>;
  whatsapp: SourceState<TenantWhatsAppRedacted>;
};

export async function getTenantSettingsSnapshot(tenantId: string): Promise<TenantSettingsSnapshot> {
  const [branding, contact, smtp, whatsapp] = await Promise.all([
    getTenantBrandingSource(tenantId),
    getTenantContactSource(tenantId),
    getTenantSmtpSource(tenantId),
    getTenantWhatsAppSource(tenantId),
  ]);
  return { branding, contact, smtp, whatsapp };
}

export async function getTenantBrandingSource(
  tenantId: string,
): Promise<SourceState<TenantBranding | null>> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenants')
    .select('name, logo_url, favicon_url, primary_color, secondary_color, terms_url, privacy_url')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ready', data: null };
  return {
    status: 'ready',
    data: {
      name: data.name as string,
      logo_url: (data.logo_url as string | null) ?? null,
      favicon_url: (data.favicon_url as string | null) ?? null,
      primary_color: (data.primary_color as string | null) ?? null,
      secondary_color: (data.secondary_color as string | null) ?? null,
      terms_url: (data.terms_url as string | null) ?? null,
      privacy_url: (data.privacy_url as string | null) ?? null,
    },
  };
}

export async function getTenantContactSource(
  tenantId: string,
): Promise<SourceState<TenantContact | null>> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenants')
    .select('email_sender_name, email_reply_to, terms_url, privacy_url')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ready', data: null };
  return {
    status: 'ready',
    data: {
      email_sender_name: (data.email_sender_name as string | null) ?? null,
      email_reply_to: (data.email_reply_to as string | null) ?? null,
      terms_url: (data.terms_url as string | null) ?? null,
      privacy_url: (data.privacy_url as string | null) ?? null,
    },
  };
}

export async function getTenantSmtpSource(
  tenantId: string,
): Promise<SourceState<TenantSmtpRedacted>> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenant_smtp_config')
    .select('host, port, username, from_address, enabled, password_encrypted')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ready', data: null };
  return {
    status: 'ready',
    data: {
      host: data.host as string,
      port: data.port as number,
      username: data.username as string,
      from_address: data.from_address as string,
      enabled: Boolean(data.enabled),
      has_password: Boolean(data.password_encrypted),
    },
  };
}

export async function getTenantWhatsAppSource(
  tenantId: string,
): Promise<SourceState<TenantWhatsAppRedacted>> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from('tenant_whatsapp_config')
    .select('phone_number_id, business_account_id, enabled, access_token_encrypted')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return { status: 'unavailable' };
  if (!data) return { status: 'ready', data: null };
  return {
    status: 'ready',
    data: {
      phone_number_id: data.phone_number_id as string,
      business_account_id: data.business_account_id as string,
      enabled: Boolean(data.enabled),
      has_access_token: Boolean(data.access_token_encrypted),
    },
  };
}

export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const source = await getTenantBrandingSource(tenantId);
  return source.status === 'ready' ? source.data : null;
}

export async function getTenantWhatsAppRedacted(tenantId: string): Promise<TenantWhatsAppRedacted> {
  const source = await getTenantWhatsAppSource(tenantId);
  return source.status === 'ready' ? source.data : null;
}

export async function getTenantContact(tenantId: string): Promise<TenantContact | null> {
  const source = await getTenantContactSource(tenantId);
  return source.status === 'ready' ? source.data : null;
}

// Returns SMTP config without the encrypted password (UI only sees has_password).
export async function getTenantSmtpRedacted(tenantId: string): Promise<TenantSmtpRedacted> {
  const source = await getTenantSmtpSource(tenantId);
  return source.status === 'ready' ? source.data : null;
}
