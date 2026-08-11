import { z } from 'zod';

export const serviceCaseStatuses = [
  'draft',
  'documents_pending',
  'ready_to_submit',
  'submitted',
  'authority_review',
  'approved',
  'completed',
  'cancelled',
] as const;

export const serviceCasePriorities = ['low', 'normal', 'high', 'urgent'] as const;

const statusSchema = z.enum(serviceCaseStatuses);
const prioritySchema = z.enum(serviceCasePriorities);
const uuidSchema = z.string().uuid();

function trimmedString(minimum: number, maximum: number) {
  return z.string().trim().min(minimum).max(maximum);
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4,})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= daysInMonth;
}

const datetimeSchema = z.iso.datetime({ offset: true }).refine(isValidCalendarDate, {
  message: 'Invalid calendar date',
});

const nullableDatetimeSchema = datetimeSchema.nullable().optional();
const nullableUuidSchema = uuidSchema.nullable().optional();
const nullableBlockedReasonSchema = trimmedString(2, 500).nullable().optional();

export const createServiceCaseSchema = z
  .object({
    client_id: uuidSchema,
    title: trimmedString(2, 160),
    service_type: trimmedString(2, 80),
    priority: prioritySchema.default('normal'),
    assigned_to: nullableUuidSchema,
    due_at: nullableDatetimeSchema,
    sla_due_at: nullableDatetimeSchema,
    blocked_reason: nullableBlockedReasonSchema,
  })
  .strict();

export const updateServiceCaseSchema = z
  .object({
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    assigned_to: nullableUuidSchema,
    due_at: nullableDatetimeSchema,
    sla_due_at: nullableDatetimeSchema,
    blocked_reason: nullableBlockedReasonSchema,
    completed_at: nullableDatetimeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: 'custom', message: 'At least one field must be supplied' });
    }

    if (value.status === 'completed' && value.completed_at == null) {
      context.addIssue({
        code: 'custom',
        path: ['completed_at'],
        message: 'completed status requires completed_at',
      });
    }

    if (value.status !== undefined && value.status !== 'completed' && value.completed_at != null) {
      context.addIssue({
        code: 'custom',
        path: ['completed_at'],
        message: 'non-completed status cannot have completed_at',
      });
    }
  });

export const serviceCaseFilterSchema = z
  .object({
    status: z
      .array(statusSchema)
      .max(8)
      .transform((statuses) => [...new Set(statuses)])
      .optional(),
    assigned_to: uuidSchema.optional(),
    client_id: uuidSchema.optional(),
  })
  .strict();

export type CreateServiceCaseInput = z.infer<typeof createServiceCaseSchema>;
export type UpdateServiceCaseInput = z.infer<typeof updateServiceCaseSchema>;
