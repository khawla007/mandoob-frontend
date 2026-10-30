'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { enforcePrivilegedSession } from '@/lib/auth/require-role';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  mutateAssignedCompanySettings,
  settingsFailure,
  type SettingsContext,
  type SettingsErrorKey,
  type SettingsResult,
  type SettingsSection,
} from '@/lib/data/tenant-settings';
import { encrypt, createBlindIndex } from '@/lib/crypto/pii';
import {
  brandingSchema,
  contactSchema,
  smtpSchema,
  whatsappSchema,
  settingsOperationSchema,
} from '@/lib/validation/tenant-settings';

export type ActionResult = SettingsResult;
export type SettingsActionErrorKey = SettingsErrorKey;

async function resolveAndAuthorize(slug: string): Promise<SettingsContext> {
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await enforcePrivilegedSession(session);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, tenant.slug);
  if (!company || company.tenantId !== tenant.id) throw new Error('FORBIDDEN');
  return { actorProfileId: session.id, tenantId: tenant.id, companyId: company.id };
}

async function updateSettings(
  slug: string,
  section: SettingsSection,
  raw: unknown,
): Promise<SettingsResult> {
  try {
    const context = await resolveAndAuthorize(slug);
    const operation = settingsOperationSchema.safeParse(raw);
    const parsed = {
      branding: brandingSchema,
      contact: contactSchema,
      smtp: smtpSchema,
      whatsapp: whatsappSchema,
    }[section].safeParse(raw);
    if (!operation.success || !parsed.success) return settingsFailure('INVALID_SETTINGS_INPUT');
    const input: Record<string, unknown> = { ...parsed.data };
    const replacement =
      section === 'smtp' ? input.password : section === 'whatsapp' ? input.access_token : null;
    delete input.password;
    delete input.access_token;
    for (const key of Object.keys(input))
      if (typeof input[key] === 'string' && input[key] === '') input[key] = null;
    let result: SettingsResult;
    try {
      const secret = typeof replacement === 'string' && replacement.length > 0 ? replacement : null;
      result = await mutateAssignedCompanySettings(
        context,
        section,
        operation.data,
        input,
        secret === null ? null : encrypt(secret),
        secret === null
          ? null
          : createBlindIndex(`company-settings:${section}:${context.tenantId}`, secret),
      );
    } catch {
      return settingsFailure(undefined);
    }
    if (!result.ok) return result;
    // Optional cache work must not change an already committed mutation's result.
    try {
      revalidatePath(`/t/${slug}/settings`);
      revalidatePath(`/t/${slug}`, 'layout');
    } catch {
      /* The committed receipt remains authoritative; the next navigation reads fresh data. */
    }
    return result;
  } catch {
    return settingsFailure('FORBIDDEN');
  }
}

export async function updateBrandingAction(slug: string, raw: unknown): Promise<SettingsResult> {
  return updateSettings(slug, 'branding', raw);
}
export async function updateContactAction(slug: string, raw: unknown): Promise<SettingsResult> {
  return updateSettings(slug, 'contact', raw);
}
export async function updateSmtpAction(slug: string, raw: unknown): Promise<SettingsResult> {
  return updateSettings(slug, 'smtp', raw);
}
export async function updateWhatsAppAction(slug: string, raw: unknown): Promise<SettingsResult> {
  return updateSettings(slug, 'whatsapp', raw);
}
