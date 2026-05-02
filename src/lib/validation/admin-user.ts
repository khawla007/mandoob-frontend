import { z } from 'zod';
import { emailSchema, phoneSchema } from '@/lib/validation/auth';

const SERVICE_AREAS = [
  'ABU_DHABI',
  'DUBAI',
  'SHARJAH',
  'AJMAN',
  'UAQ',
  'RAK',
  'FUJAIRAH',
  'ALL_UAE',
] as const;

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const futureDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((d) => Date.parse(d) >= Date.parse(todayIso()), 'Date must be today or later');

const baseFields = z.object({
  full_name: z.string().min(1).max(200),
  email: emailSchema,
  phone: phoneSchema,
  tenant_id: z.string().uuid(),
});

const adminBase = baseFields.omit({ tenant_id: true });

export const createUserSchema = z.discriminatedUnion('role', [
  baseFields.extend({
    role: z.literal('pro'),
    license_no: z.string().min(1).max(200),
    designation: z.string().max(200).nullable().optional(),
    department: z.string().max(200).nullable().optional(),
    service_areas: z.array(z.enum(SERVICE_AREAS)).max(8),
    bio: z.string().max(2000).nullable().optional(),
  }),
  baseFields.extend({
    role: z.literal('customer'),
    nationality: z.string().length(2).nullable().optional(),
    passport_no: z.string().max(50).nullable().optional(),
    linked_client_id: z.string().uuid().nullable().optional(),
  }),
  baseFields.extend({
    role: z.literal('employee'),
    client_id: z.string().uuid(),
    passport_no: z.string().max(50).nullable().optional(),
    visa_no: z.string().max(50).nullable().optional(),
    visa_expiry: futureDate.nullable().optional(),
    emirates_id: z
      .string()
      .regex(/^784-\d{4}-\d{7}-\d$/, 'Format: 784-YYYY-NNNNNNN-N')
      .nullable()
      .optional(),
    eid_expiry: futureDate.nullable().optional(),
  }),
  adminBase.extend({
    role: z.literal('admin'),
    reason: z.string().max(500).nullable().optional(),
  }),
]);

export type CreateUserInput = z.input<typeof createUserSchema>;
export type CreateUserOutput = z.output<typeof createUserSchema>;
export type CreateUserRole = CreateUserOutput['role'];
export const SERVICE_AREA_VALUES = SERVICE_AREAS;

// ─────────────────────────────────────────────────────────────────────────────
// Edit (PATCH /api/v1/admin/users/[id]) — same shape as create minus email.
// tenant_id stays in the payload for round-tripping but is immutable server-side.
// ─────────────────────────────────────────────────────────────────────────────

const editBaseFields = baseFields.omit({ email: true });
const editAdminBase = adminBase.omit({ email: true });

export const editUserSchema = z.discriminatedUnion('role', [
  editBaseFields.extend({
    role: z.literal('pro'),
    license_no: z.string().min(1).max(200),
    designation: z.string().max(200).nullable().optional(),
    department: z.string().max(200).nullable().optional(),
    service_areas: z.array(z.enum(SERVICE_AREAS)).max(8),
    bio: z.string().max(2000).nullable().optional(),
  }),
  editBaseFields.extend({
    role: z.literal('customer'),
    nationality: z.string().length(2).nullable().optional(),
    passport_no: z.string().max(50).nullable().optional(),
    linked_client_id: z.string().uuid().nullable().optional(),
  }),
  editBaseFields.extend({
    role: z.literal('employee'),
    client_id: z.string().uuid(),
    passport_no: z.string().max(50).nullable().optional(),
    visa_no: z.string().max(50).nullable().optional(),
    visa_expiry: futureDate.nullable().optional(),
    emirates_id: z
      .string()
      .regex(/^784-\d{4}-\d{7}-\d$/, 'Format: 784-YYYY-NNNNNNN-N')
      .nullable()
      .optional(),
    eid_expiry: futureDate.nullable().optional(),
  }),
  editAdminBase.extend({
    role: z.literal('admin'),
  }),
]);

export type EditUserInput = z.input<typeof editUserSchema>;
export type EditUserOutput = z.output<typeof editUserSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Change role (POST /api/v1/admin/users/[id]/role)
// Discriminated by newRole. Carries the new role's required sub-row fields so
// the orchestrator can swap in one round-trip. super_admin promotion is
// intentionally absent — UI cannot promote to super_admin.
// ─────────────────────────────────────────────────────────────────────────────

export const changeRoleSchema = z.discriminatedUnion('newRole', [
  z.object({
    newRole: z.literal('pro'),
    tenant_id: z.string().uuid(),
    confirmation: z.literal('DEMOTE').optional(),
    reason: z.string().max(500).nullable().optional(),
    license_no: z.string().min(1).max(200),
    designation: z.string().max(200).nullable().optional(),
    department: z.string().max(200).nullable().optional(),
    service_areas: z.array(z.enum(SERVICE_AREAS)).max(8),
    bio: z.string().max(2000).nullable().optional(),
  }),
  z.object({
    newRole: z.literal('customer'),
    tenant_id: z.string().uuid(),
    confirmation: z.literal('DEMOTE').optional(),
    reason: z.string().max(500).nullable().optional(),
    nationality: z.string().length(2).nullable().optional(),
    passport_no: z.string().max(50).nullable().optional(),
    linked_client_id: z.string().uuid().nullable().optional(),
  }),
  z.object({
    newRole: z.literal('employee'),
    tenant_id: z.string().uuid(),
    confirmation: z.literal('DEMOTE').optional(),
    reason: z.string().max(500).nullable().optional(),
    client_id: z.string().uuid(),
    passport_no: z.string().max(50).nullable().optional(),
    visa_no: z.string().max(50).nullable().optional(),
    visa_expiry: futureDate.nullable().optional(),
    emirates_id: z
      .string()
      .regex(/^784-\d{4}-\d{7}-\d$/, 'Format: 784-YYYY-NNNNNNN-N')
      .nullable()
      .optional(),
    eid_expiry: futureDate.nullable().optional(),
  }),
  z.object({
    newRole: z.literal('admin'),
    confirmation: z.literal('DEMOTE').optional(),
    reason: z.string().max(500).nullable().optional(),
  }),
]);

export type ChangeRoleInput = z.input<typeof changeRoleSchema>;
export type ChangeRoleOutput = z.output<typeof changeRoleSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Change status (POST /api/v1/admin/users/[id]/status)
// 'suspended' requires a non-empty reason. The orchestrator enforces the full
// transition matrix; Zod only enforces the per-status field shape.
// ─────────────────────────────────────────────────────────────────────────────

export const changeStatusSchema = z.discriminatedUnion('newStatus', [
  z.object({ newStatus: z.literal('active') }),
  z.object({
    newStatus: z.literal('suspended'),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    newStatus: z.literal('disabled'),
    reason: z.string().max(500).nullable().optional(),
  }),
]);

export type ChangeStatusInput = z.input<typeof changeStatusSchema>;
export type ChangeStatusOutput = z.output<typeof changeStatusSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Reset MFA (POST /api/v1/admin/users/[id]/mfa-reset)
// ─────────────────────────────────────────────────────────────────────────────

export const mfaResetSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export type MfaResetInput = z.input<typeof mfaResetSchema>;
export type MfaResetOutput = z.output<typeof mfaResetSchema>;
