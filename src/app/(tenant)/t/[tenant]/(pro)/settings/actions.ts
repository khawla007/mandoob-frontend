'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { encrypt } from '@/lib/crypto/pii';
import { resolveSecretPrerequisite } from '@/lib/settings/secret-prerequisite';
import {
  brandingSchema,
  contactSchema,
  smtpSchema,
  whatsappSchema,
  type BrandingInput,
  type ContactInput,
  type SmtpInput,
  type WhatsAppInput,
} from '@/lib/validation/tenant-settings';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; errorKey: SettingsActionErrorKey; code: string };

export type SettingsActionErrorKey =
  | 'validation'
  | 'unavailable'
  | 'forbidden'
  | 'saveFailed'
  | 'credentialRequired';

async function getCallerContext() {
  const hdr = await headers();
  const ip = hdr.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const userAgent = hdr.get('user-agent') ?? null;
  return { ip, userAgent };
}

async function resolveAndAuthorize(slug: string) {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenant.slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  const request = await getCallerContext();
  return {
    ctx: {
      caller: { id: session.id },
      ...request,
    },
    tenant,
    companyId: company.id,
  };
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

async function logSettingsUpdate(
  ctx: { caller: { id: string }; ip: string; userAgent: string | null },
  tenantId: string,
  companyId: string,
  section: 'branding' | 'contact' | 'smtp' | 'whatsapp',
  changedFields: string[],
) {
  const admin = createSupabaseServiceRoleClient();
  await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: ctx.caller.id,
    action: 'updated',
    source: 'self_serve',
    details: { company_id: companyId, section, changed_fields: changedFields },
  });
  await recordAuthEvent({
    kind: 'tenant_self_updated',
    actorUserId: ctx.caller.id,
    tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { company_id: companyId, section, changed_fields: changedFields },
  }).catch((err) => console.error('recordAuthEvent failed', err));
}

function actionFailure(error: unknown, fallback: SettingsActionErrorKey): ActionResult<never> {
  if (error instanceof ApiError) {
    const errorKeys: Partial<Record<string, SettingsActionErrorKey>> = {
      FORBIDDEN: 'forbidden',
      TENANT_INACTIVE: 'unavailable',
      TENANT_NOT_FOUND: 'unavailable',
    };
    return { ok: false, errorKey: errorKeys[error.code] ?? fallback, code: error.code };
  }
  console.error('settings action failed', error);
  return { ok: false, errorKey: fallback, code: 'INTERNAL' };
}

export async function updateBrandingAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = brandingSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, errorKey: 'validation', code: 'VALIDATION_FAILED' };
    }
    const { ctx, tenant, companyId } = await resolveAndAuthorize(slug);
    const input: BrandingInput = parsed.data;

    const patch: Record<string, string | null> = {
      logo_url: emptyToNull(input.logo_url),
      favicon_url: emptyToNull(input.favicon_url),
      primary_color: emptyToNull(input.primary_color),
      secondary_color: emptyToNull(input.secondary_color),
    };
    if (input.name && input.name.trim().length >= 2) patch.name = input.name.trim();

    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.from('tenants').update(patch).eq('id', tenant.id);
    if (error) {
      console.error('updateBranding failed', error);
      return { ok: false, errorKey: 'saveFailed', code: 'INTERNAL' };
    }

    await logSettingsUpdate(ctx, tenant.id, companyId, 'branding', Object.keys(patch));
    revalidatePath(`/t/${slug}/settings`);
    revalidatePath(`/t/${slug}`, 'layout');
    return { ok: true, data: undefined };
  } catch (e) {
    return actionFailure(e, 'saveFailed');
  }
}

export async function updateContactAction(slug: string, raw: unknown): Promise<ActionResult<void>> {
  try {
    const parsed = contactSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, errorKey: 'validation', code: 'VALIDATION_FAILED' };
    }
    const { ctx, tenant, companyId } = await resolveAndAuthorize(slug);
    const input: ContactInput = parsed.data;

    const patch = {
      email_sender_name: emptyToNull(input.email_sender_name),
      email_reply_to: emptyToNull(input.email_reply_to),
      terms_url: emptyToNull(input.terms_url),
      privacy_url: emptyToNull(input.privacy_url),
    };

    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.from('tenants').update(patch).eq('id', tenant.id);
    if (error) {
      console.error('updateContact failed', error);
      return { ok: false, errorKey: 'saveFailed', code: 'INTERNAL' };
    }

    await logSettingsUpdate(ctx, tenant.id, companyId, 'contact', Object.keys(patch));
    revalidatePath(`/t/${slug}/settings`);
    revalidatePath(`/t/${slug}`, 'layout');
    return { ok: true, data: undefined };
  } catch (e) {
    return actionFailure(e, 'saveFailed');
  }
}

export async function updateSmtpAction(slug: string, raw: unknown): Promise<ActionResult<void>> {
  try {
    const parsed = smtpSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, errorKey: 'validation', code: 'VALIDATION_FAILED' };
    }
    const { ctx, tenant, companyId } = await resolveAndAuthorize(slug);
    const input: SmtpInput = parsed.data;

    const admin = createSupabaseServiceRoleClient();
    const secret = await resolveSecretPrerequisite({
      replacementSecret: input.password ?? '',
      readExisting: async () => {
        const { data, error } = await admin
          .from('tenant_smtp_config')
          .select('password_encrypted')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        return {
          secret: (data?.password_encrypted as string | undefined) ?? null,
          unavailable: Boolean(error),
        };
      },
      encrypt,
      mutate: async (passwordEncrypted) => {
        const { error } = await admin.from('tenant_smtp_config').upsert(
          {
            tenant_id: tenant.id,
            host: input.host,
            port: input.port,
            username: input.username,
            password_encrypted: passwordEncrypted,
            from_address: input.from_address,
            enabled: input.enabled,
          },
          { onConflict: 'tenant_id' },
        );
        if (error) throw new ApiError('INTERNAL', 'SMTP config update failed', 500);
      },
    });
    if (!secret.ok) {
      return {
        ok: false,
        errorKey: secret.reason === 'unavailable' ? 'unavailable' : 'credentialRequired',
        code: secret.reason === 'unavailable' ? 'SOURCE_UNAVAILABLE' : 'VALIDATION_FAILED',
      };
    }

    const changed = ['host', 'port', 'username', 'from_address', 'enabled'];
    if (input.password?.trim()) changed.push('password');
    await logSettingsUpdate(ctx, tenant.id, companyId, 'smtp', changed);
    revalidatePath(`/t/${slug}/settings`);
    revalidatePath(`/t/${slug}`, 'layout');
    return { ok: true, data: undefined };
  } catch (e) {
    return actionFailure(e, 'saveFailed');
  }
}

export async function updateWhatsAppAction(
  slug: string,
  raw: unknown,
): Promise<ActionResult<void>> {
  try {
    const parsed = whatsappSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, errorKey: 'validation', code: 'VALIDATION_FAILED' };
    }
    const { ctx, tenant, companyId } = await resolveAndAuthorize(slug);
    const input: WhatsAppInput = parsed.data;

    const admin = createSupabaseServiceRoleClient();
    const secret = await resolveSecretPrerequisite({
      replacementSecret: input.access_token ?? '',
      readExisting: async () => {
        const { data, error } = await admin
          .from('tenant_whatsapp_config')
          .select('access_token_encrypted')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        return {
          secret: (data?.access_token_encrypted as string | undefined) ?? null,
          unavailable: Boolean(error),
        };
      },
      encrypt,
      mutate: async (accessTokenEncrypted) => {
        const { error } = await admin.from('tenant_whatsapp_config').upsert(
          {
            tenant_id: tenant.id,
            business_account_id: input.business_account_id,
            phone_number_id: input.phone_number_id,
            access_token_encrypted: accessTokenEncrypted,
            enabled: input.enabled,
          },
          { onConflict: 'tenant_id' },
        );
        if (error) throw new ApiError('INTERNAL', 'WhatsApp config update failed', 500);
      },
    });
    if (!secret.ok) {
      return {
        ok: false,
        errorKey: secret.reason === 'unavailable' ? 'unavailable' : 'credentialRequired',
        code: secret.reason === 'unavailable' ? 'SOURCE_UNAVAILABLE' : 'VALIDATION_FAILED',
      };
    }

    const changed = ['business_account_id', 'phone_number_id', 'enabled'];
    if (input.access_token?.trim()) changed.push('access_token');
    await logSettingsUpdate(ctx, tenant.id, companyId, 'whatsapp', changed);
    revalidatePath(`/t/${slug}/settings`);
    revalidatePath(`/t/${slug}`, 'layout');
    return { ok: true, data: undefined };
  } catch (e) {
    return actionFailure(e, 'saveFailed');
  }
}
