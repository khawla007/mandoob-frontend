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

export const WhatsAppRenewalReminderInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  renewalLabel: z.string().min(1),
  dueDate: z.string().min(1),
  daysOut: renewalReminderWindowSchema,
  detailPath: z.string().min(1),
});

export const WhatsAppDocumentRequestedInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  documentLabel: z.string().min(1),
  uploadPath: z.string().min(1),
  dueDate: z.string().nullable(),
});

export const WhatsAppOtpCodeInput = z.object({
  code: z.string().min(4).max(10),
});

export const WhatsAppOptOutConfirmationInput = z.object({});

export type WhatsAppRenewalReminder = z.infer<typeof WhatsAppRenewalReminderInput>;
export type WhatsAppDocumentRequested = z.infer<typeof WhatsAppDocumentRequestedInput>;
export type WhatsAppOtpCode = z.infer<typeof WhatsAppOtpCodeInput>;
export type WhatsAppOptOutConfirmation = z.infer<typeof WhatsAppOptOutConfirmationInput>;
