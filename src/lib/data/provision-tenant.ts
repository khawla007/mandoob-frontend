import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { adminCreateUser, type AdminCreateUserCaller } from '@/lib/data/admin-create-user';
import { promoteToTenantAdmin } from '@/lib/data/promote-to-tenant-admin';
import { recordAuthEvent } from '@/lib/logging/auth-events';
import { enqueueEmail } from '@/lib/mail/send';
import type { ProvisionTenantInput } from '@/lib/validation/tenant-onboarding';

export type ProvisionTenantResult = {
  tenantId: string;
  adminUserId: string;
};

export type ProvisionTenantContext = {
  caller: AdminCreateUserCaller;
  ip: string;
  userAgent: string | null;
};

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

export async function provisionTenant(
  input: ProvisionTenantInput,
  ctx: ProvisionTenantContext,
): Promise<ProvisionTenantResult> {
  const admin = createSupabaseServiceRoleClient();

  // Insert the tenant row first. Slug-uniqueness + format are enforced at
  // the DB level (UNIQUE + CHECK), so we surface those as 4xx instead of 5xx.
  const { data: tenantRow, error: tenantErr } = await admin
    .from('tenants')
    .insert({
      slug: input.slug,
      name: input.name,
      plan: input.plan,
      status: input.status,
    })
    .select('id')
    .single();

  if (tenantErr || !tenantRow) {
    if (tenantErr?.code === PG_UNIQUE_VIOLATION) {
      throw new ApiError('VALIDATION_FAILED', 'Slug already in use', 409);
    }
    if (tenantErr?.code === PG_CHECK_VIOLATION) {
      throw new ApiError('VALIDATION_FAILED', 'Tenant rejected by check constraint', 400);
    }
    console.error('tenant insert failed', tenantErr);
    throw new ApiError('INTERNAL', 'Could not create tenant', 500);
  }

  const tenantId = tenantRow.id as string;

  async function deleteTenant(reason: string): Promise<void> {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId);
    if (error) console.error('tenant rollback delete failed', { reason, tenantId, error });
  }

  // Provision the PRO admin user via the existing orchestrator.
  // license_no is required by createUserSchema; the PRO admin will update it
  // later via /account/role. We use a placeholder string that passes validation
  // but is clearly distinguishable in the DB.
  let adminUserId: string;
  try {
    const result = await adminCreateUser(
      {
        role: 'pro',
        tenant_id: tenantId,
        full_name: input.admin_full_name,
        email: input.admin_email,
        phone: input.admin_phone,
        license_no: 'PENDING_ONBOARDING',
        service_areas: [],
        designation: null,
        department: null,
        bio: null,
      },
      ctx,
    );
    adminUserId = result.userId;
  } catch (e) {
    await deleteTenant('admin user create failed');
    throw e;
  }

  // Promote the freshly-created PRO user to the per-tenant `admin` role.
  // adminCreateUser blocks non-super_admin callers from creating admins
  // directly, so we always create as 'pro' and flip here.
  try {
    await promoteToTenantAdmin(adminUserId, tenantId);
  } catch (e) {
    await deleteTenant('promote-to-admin failed');
    try {
      await admin.auth.admin.deleteUser(adminUserId);
    } catch (err) {
      console.error('compensation deleteUser after promote failed', err);
    }
    throw e;
  }

  // For self-serve there is no logged-in actor. tenant_audit_log.actor_id has
  // an FK to profiles.id, so we pass null. For admin-led we use the caller.
  const actorId = input.source === 'self_serve' ? null : ctx.caller.id;

  const { error: auditErr } = await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action: 'created',
    source: input.source,
    details: { admin_user_id: adminUserId, plan: input.plan, status: input.status },
  });
  if (auditErr) console.error('tenant_audit_log insert failed', auditErr);

  await recordAuthEvent({
    kind: input.source === 'self_serve' ? 'tenant_self_serve_submitted' : 'tenant_provisioned',
    actorUserId: actorId,
    tenantId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { admin_user_id: adminUserId, slug: input.slug, plan: input.plan },
  }).catch((err) => {
    console.error('recordAuthEvent failed', err);
  });

  if (input.source === 'self_serve') {
    await enqueueEmail({
      tenantId,
      templateId: 'tenant-pending-received',
      toAddress: input.admin_email,
      input: {
        adminName: input.admin_full_name,
        tenantName: input.name,
      },
      linked: { entityType: 'tenant_pending', entityId: tenantId },
    }).catch((err) => console.error('enqueue tenant-pending-received failed', err));
  }

  return { tenantId, adminUserId };
}
