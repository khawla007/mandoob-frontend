import { z } from 'zod';
import { emailSchema, phoneSchema } from './auth';

const optionalText = (max: number) => z.string().trim().max(max).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use YYYY-MM-DD');
const nullableDate = isoDate.nullable().optional();
const operationId = z.string().uuid();

/** Plaintext identifiers exist only between the form and server-side sealing. */
const employeeFields = {
  name: z.string().trim().min(1).max(160),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  nationality: optionalText(2).nullable(),
  job_title: optionalText(120).nullable(),
  passport_no: optionalText(50).nullable(),
  visa_no: optionalText(50).nullable(),
  visa_expiry: nullableDate,
  emirates_id: z
    .string()
    .trim()
    .regex(/^784-\d{4}-\d{7}-\d$/u, 'Format: 784-YYYY-NNNNNNN-N')
    .nullable()
    .optional()
    .or(z.literal('')),
  eid_expiry: nullableDate,
};

export const createEmployeeSchema = z
  .object({ operation_id: operationId, ...employeeFields })
  .strict();
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z
  .object({
    operation_id: operationId,
    employee_id: z.string().uuid(),
    expected_version: z.number().int().min(1),
    patch: z
      .object(employeeFields)
      .partial()
      .strict()
      .refine((patch) => Object.keys(patch).length > 0, { message: 'no fields to update' }),
  })
  .strict();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const setEmployeeStatusSchema = z
  .object({
    operation_id: operationId,
    employee_id: z.string().uuid(),
    expected_version: z.number().int().min(1),
    status: z.enum(['active', 'inactive']),
  })
  .strict();
export type SetEmployeeStatusInput = z.infer<typeof setEmployeeStatusSchema>;

export const employeeSelfUpdateSchema = z
  .object({
    operation_id: operationId,
    expected_version: z.number().int().min(1),
    phone: phoneSchema.nullable().optional(),
    renewal_reminders_enabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.phone !== undefined || value.renewal_reminders_enabled !== undefined, {
    message: 'no fields to update',
  });
export type EmployeeSelfUpdateInput = z.infer<typeof employeeSelfUpdateSchema>;
