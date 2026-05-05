import { z } from 'zod';

export const AUDIT_KIND = ['tenant_audit', 'auth_event'] as const;
export type AuditKind = (typeof AUDIT_KIND)[number];

export const TENANT_AUDIT_ACTIONS = [
  'created',
  'approved',
  'rejected',
  'suspended',
  'reactivated',
  'updated',
  'completed',
  'cancelled',
  'unlocked',
  'session_revoked',
] as const;
export type TenantAuditAction = (typeof TENANT_AUDIT_ACTIONS)[number];

export const AUTH_EVENT_KINDS = [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'password_changed',
  'mfa_enrolled',
  'mfa_challenge_success',
  'mfa_challenge_failure',
  'mfa_reset',
  'mfa_factor_removed',
  'invite_created',
  'invite_accepted',
  'admin_created',
  'admin_user_edited',
  'admin_user_role_changed',
  'admin_user_status_changed',
  'profile_self_edited',
  'session_revoked',
  'impersonation_started',
  'impersonation_ended',
  'tenant_provisioned',
  'tenant_self_serve_submitted',
  'tenant_approved',
  'tenant_rejected',
  'tenant_suspended',
  'tenant_reactivated',
] as const;
export type AuthEventKind = (typeof AUTH_EVENT_KINDS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();

export const auditLogFiltersSchema = z.object({
  kind: z.enum(AUDIT_KIND).default('tenant_audit'),
  tenant: uuid.optional(),
  actor: uuid.optional(),
  actions: z.array(z.string()).default([]),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(200).optional(),
  cursor: z.string().max(200).optional(),
});
export type AuditLogFilters = z.infer<typeof auditLogFiltersSchema>;

export const sessionsFiltersSchema = z.object({
  tenant: uuid.optional(),
  role: z.enum(['super_admin', 'admin', 'pro', 'customer', 'employee']).optional(),
  window: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
});
export type SessionsFilters = z.infer<typeof sessionsFiltersSchema>;

export const revokeSessionInput = z.object({
  sessionId: uuid,
  userId: uuid,
});

export const revokeAllInput = z.object({ userId: uuid });

export const unlockKeyInput = z.object({
  key: z
    .string()
    .min(5)
    .max(200)
    .regex(/^(acct|net):/i, 'must start with acct: or net:'),
});
