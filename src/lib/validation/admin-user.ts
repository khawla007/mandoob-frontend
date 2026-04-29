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
