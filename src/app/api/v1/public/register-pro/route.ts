import { NextRequest } from 'next/server';
import { guardCsrf } from '@/lib/auth/csrf-guard';
import { errorResponse, jsonOk, ApiError } from '@/lib/errors';
import { getClientIp, getUserAgent, parseJson } from '@/lib/auth/request';
import { consumeRateLimit } from '@/lib/rate-limit';
import { provisionTenant } from '@/lib/data/provision-tenant';
import { provisionTenantSchema } from '@/lib/validation/tenant-onboarding';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { baseTenantSlug, suggestTenantSlug } from '@/lib/tenant/slug';
import { z } from 'zod';
import { emailSchema, phoneSchema } from '@/lib/validation/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SELF_SERVE_LIMIT = { capacity: 5, refillPerSec: 5 / 3600 }; // 5/hour per IP

const publicProRegisterSchema = z.object({
  name: z.string().min(3).max(200),
  plan: provisionTenantSchema.shape.plan,
  admin_email: emailSchema,
  admin_full_name: z.string().min(1).max(200),
  admin_phone: phoneSchema,
});

async function pickAvailableSlug(seed: string): Promise<string | null> {
  const admin = createSupabaseServiceRoleClient();
  const candidates = [seed, ...Array.from({ length: 25 }, (_, i) => `${seed}-${i + 2}`)];
  const { data, error } = await admin.from('tenants').select('slug').in('slug', candidates);
  if (error) {
    console.error('slug lookup failed', error);
    return null;
  }
  const taken = new Set((data ?? []).map((r) => r.slug as string));
  return suggestTenantSlug(seed, taken);
}

export async function POST(request: NextRequest) {
  const csrfFail = await guardCsrf(request);
  if (csrfFail) return csrfFail;

  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!(await consumeRateLimit({ key: `register-pro:${ip}`, ...SELF_SERVE_LIMIT }))) {
    return errorResponse('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = publicProRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }

  const slug = await pickAvailableSlug(baseTenantSlug(parsed.data.name));
  if (!slug) {
    return errorResponse('SLUG_TAKEN', 'Could not allocate a unique slug. Try a different firm name.', 409);
  }

  try {
    const result = await provisionTenant(
      {
        ...parsed.data,
        slug,
        status: 'pending',
        source: 'self_serve',
      },
      {
        // Self-serve has no logged-in caller. The orchestrator records
        // ctx.caller.id as actor_id; for self-serve we use the new admin user
        // id, but at this point we don't have it yet. Pass a placeholder
        // that adminCreateUser tolerates (super_admin with no tenant).
        // The caller checks gate role==='admin' / cross-tenant only — for
        // role==='pro' creates only the tenant_id check matters and that's
        // satisfied by passing the freshly-inserted tenant id.
        caller: { id: '00000000-0000-0000-0000-000000000000', role: 'super_admin', tenantId: null },
        ip,
        userAgent,
      },
    );
    return jsonOk({ tenantId: result.tenantId, slug, status: 'pending' }, { status: 201 });
  } catch (e) {
    if (e instanceof ApiError) {
      return errorResponse(e.code, e.message, e.status, e.details);
    }
    console.error('public register-pro unexpected error', e);
    return errorResponse('INTERNAL', 'Could not create PRO firm', 500);
  }
}
