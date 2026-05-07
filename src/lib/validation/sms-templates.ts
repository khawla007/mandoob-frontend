import { z } from 'zod';

const renewalReminderWindowSchema = z.union([
  z.literal(90),
  z.literal(60),
  z.literal(30),
  z.literal(14),
  z.literal(7),
  z.literal(3),
  z.literal(1),
]);

export const SmsRenewalReminderInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  renewalLabel: z.string().min(1),
  dueDate: z.string().min(1),
  daysOut: renewalReminderWindowSchema,
  detailUrl: z.string().min(1),
});

export const SmsDocumentRequestedInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  documentLabel: z.string().min(1),
  uploadUrl: z.string().min(1),
  dueDate: z.string().nullable(),
});

export const SmsOtpCodeInput = z.object({
  code: z.string().min(4).max(10),
});

export type SmsRenewalReminder = z.infer<typeof SmsRenewalReminderInput>;
export type SmsDocumentRequested = z.infer<typeof SmsDocumentRequestedInput>;
export type SmsOtpCode = z.infer<typeof SmsOtpCodeInput>;
