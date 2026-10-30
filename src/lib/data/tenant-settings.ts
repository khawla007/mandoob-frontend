import 'server-only';
import { z } from 'zod';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SourceState } from '@/lib/settings/provider-state';
import {
  brandingSchema,
  contactSchema,
  smtpSchema,
  whatsappSchema,
  settingsOperationSchema,
} from '@/lib/validation/tenant-settings';

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
export type SettingsSection = 'branding' | 'contact' | 'smtp' | 'whatsapp';
export type SettingsContext = { actorProfileId: string; tenantId: string; companyId: string };
export type SettingsReceipt = {
  company_id: string;
  section: SettingsSection;
  version: number;
  operation_id: string;
};
export type SettingsErrorKey =
  | 'validation'
  | 'unavailable'
  | 'forbidden'
  | 'saveFailed'
  | 'credentialRequired'
  | 'conflict';
export type SettingsResult =
  | { ok: true; data: SettingsReceipt }
  | { ok: false; errorKey: SettingsErrorKey; code: SettingsErrorCode };
type SettingsErrorCode =
  | 'FORBIDDEN'
  | 'INVALID_SETTINGS_INPUT'
  | 'SETTINGS_OPERATION_CONFLICT'
  | 'STALE_SETTINGS_VERSION'
  | 'SETTINGS_CREDENTIAL_REQUIRED'
  | 'SETTINGS_SAVE_FAILED';
type RpcClient = {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};
type Dependencies = { supabase?: RpcClient };
const uuid = z.string().uuid();
const contextSchema = z.object({ actorProfileId: uuid, tenantId: uuid, companyId: uuid });
const sectionSchema = z.enum(['branding', 'contact', 'smtp', 'whatsapp']);
const versionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const receiptSchema = z.object({
  company_id: uuid,
  section: sectionSchema,
  version: versionSchema,
  operation_id: uuid,
});
const smtpRedactedSchema = smtpSchema
  .omit({ password: true })
  .extend({ port: z.number().int().min(1).max(65535), has_password: z.boolean() })
  .nullable();
const whatsappRedactedSchema = whatsappSchema
  .omit({ access_token: true })
  .extend({ has_token: z.boolean() })
  .nullable();
export type TenantSettingsSnapshot = {
  branding: SourceState<TenantBranding | null>;
  contact: SourceState<TenantContact | null>;
  smtp: SourceState<TenantSmtpRedacted>;
  whatsapp: SourceState<TenantWhatsAppRedacted>;
  versions: Record<SettingsSection, number | null>;
};
function unavailable(): TenantSettingsSnapshot {
  return {
    branding: { status: 'unavailable' },
    contact: { status: 'unavailable' },
    smtp: { status: 'unavailable' },
    whatsapp: { status: 'unavailable' },
    versions: { branding: null, contact: null, smtp: null, whatsapp: null },
  };
}
function rpcClient(deps: Dependencies): RpcClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as RpcClient);
}
function rpcScope(context: SettingsContext) {
  return {
    p_actor_profile_id: context.actorProfileId,
    p_tenant_id: context.tenantId,
    p_company_id: context.companyId,
  };
}

/** The RPC rechecks active actor, tenant, credential and exact assignment on every read. */
export async function getTenantSettingsSnapshot(
  context: SettingsContext,
  deps: Dependencies = {},
): Promise<TenantSettingsSnapshot> {
  if (!contextSchema.safeParse(context).success) return unavailable();
  try {
    const { data, error } = await rpcClient(deps).rpc(
      'read_assigned_company_settings',
      rpcScope(context),
    );
    const envelope = z
      .object({
        branding: z.unknown(),
        contact: z.unknown(),
        smtp: z.unknown(),
        whatsapp: z.unknown(),
        versions: z.record(z.string(), z.unknown()),
      })
      .safeParse(data);
    if (error || !envelope.success) return unavailable();
    const result = unavailable();
    for (const section of sectionSchema.options) {
      const version = versionSchema.safeParse(envelope.data.versions[section]);
      if (version.success) result.versions[section] = version.data;
    }
    const branding = brandingSchema.nullable().safeParse(envelope.data.branding);
    const contact = contactSchema.nullable().safeParse(envelope.data.contact);
    const smtp = smtpRedactedSchema.safeParse(envelope.data.smtp);
    const whatsapp = whatsappRedactedSchema.safeParse(envelope.data.whatsapp);
    if (branding.success && result.versions.branding !== null)
      result.branding = { status: 'ready', data: branding.data };
    if (contact.success && result.versions.contact !== null)
      result.contact = { status: 'ready', data: contact.data };
    if (smtp.success && result.versions.smtp !== null)
      result.smtp = { status: 'ready', data: smtp.data };
    if (whatsapp.success && result.versions.whatsapp !== null)
      result.whatsapp = {
        status: 'ready',
        data: whatsapp.data && {
          phone_number_id: whatsapp.data.phone_number_id,
          business_account_id: whatsapp.data.business_account_id,
          enabled: whatsapp.data.enabled,
          has_access_token: whatsapp.data.has_token,
        },
      };
    return result;
  } catch {
    return unavailable();
  }
}

const errorKeys: Record<SettingsErrorCode, SettingsErrorKey> = {
  FORBIDDEN: 'forbidden',
  INVALID_SETTINGS_INPUT: 'validation',
  SETTINGS_OPERATION_CONFLICT: 'conflict',
  STALE_SETTINGS_VERSION: 'conflict',
  SETTINGS_CREDENTIAL_REQUIRED: 'credentialRequired',
  SETTINGS_SAVE_FAILED: 'saveFailed',
};
export function settingsFailure(code: string | undefined): Extract<SettingsResult, { ok: false }> {
  const safeCode: SettingsErrorCode =
    code && Object.hasOwn(errorKeys, code) ? (code as SettingsErrorCode) : 'SETTINGS_SAVE_FAILED';
  return { ok: false, code: safeCode, errorKey: errorKeys[safeCode] };
}
/** Required mutation and audit commit together; no application credential read-modify-write. */
export async function mutateAssignedCompanySettings(
  context: SettingsContext,
  section: SettingsSection,
  operation: z.infer<typeof settingsOperationSchema>,
  input: Record<string, unknown>,
  replacementEncrypted: string | null,
  replacementFingerprint: string | null,
  deps: Dependencies = {},
): Promise<SettingsResult> {
  if (!contextSchema.safeParse(context).success) return settingsFailure('FORBIDDEN');
  if (
    !sectionSchema.safeParse(section).success ||
    !settingsOperationSchema.safeParse(operation).success
  )
    return settingsFailure('INVALID_SETTINGS_INPUT');
  try {
    const { data, error } = await rpcClient(deps).rpc('mutate_assigned_company_settings', {
      ...rpcScope(context),
      p_section: section,
      p_operation_id: operation.operation_id,
      p_expected_version: operation.expected_version,
      p_input: input,
      p_replacement_secret_encrypted: replacementEncrypted,
      p_replacement_secret_fingerprint: replacementFingerprint,
    });
    if (error) return settingsFailure(error.message);
    const receipt = receiptSchema.safeParse(data);
    if (
      !receipt.success ||
      receipt.data.company_id !== context.companyId ||
      receipt.data.section !== section ||
      receipt.data.operation_id !== operation.operation_id ||
      receipt.data.version !== operation.expected_version + 1
    )
      return settingsFailure(undefined);
    return { ok: true, data: receipt.data };
  } catch {
    return settingsFailure(undefined);
  }
}

/** Ordinary SSR branding access uses a fresh session's RLS client, never service-role bypass. */
export async function getTenantBrandingSource(
  tenantId: string,
): Promise<SourceState<TenantBranding | null>> {
  if (!uuid.safeParse(tenantId).success) return { status: 'unavailable' };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user.user) return { status: 'unavailable' };
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('name, logo_url, favicon_url, primary_color, secondary_color, terms_url, privacy_url')
      .eq('id', tenantId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) return { status: 'unavailable' };
    if (!tenant) return { status: 'ready', data: null };
    const row = brandingSchema
      .extend({ terms_url: z.string().nullable(), privacy_url: z.string().nullable() })
      .safeParse(tenant);
    return row.success ? { status: 'ready', data: row.data } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
export async function getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
  const source = await getTenantBrandingSource(tenantId);
  return source.status === 'ready' ? source.data : null;
}
