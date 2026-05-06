import { z } from 'zod';

export const TenantPendingReceivedInput = z.object({
  adminName: z.string().min(1),
  tenantName: z.string().min(1),
});

export const TenantApprovedInput = z.object({
  adminName: z.string().min(1),
  tenantName: z.string().min(1),
  inviteUrl: z.string().url(),
});

export const TenantRejectedInput = z.object({
  adminName: z.string().min(1),
  tenantName: z.string().min(1),
  reason: z.string().nullable(),
});

export const DocumentRequestedInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  documentLabel: z.string().min(1),
  uploadUrl: z.string().url(),
  dueDate: z.string().nullable(),
});

export const DocumentApprovedInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  documentLabel: z.string().min(1),
});

export const RenewalReminderInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  renewalLabel: z.string().min(1),
  dueDate: z.string().min(1),
  daysOut: z.union([z.literal(30), z.literal(7), z.literal(1)]),
  detailUrl: z.string().url(),
});

export const InvoiceDueInput = z.object({
  customerName: z.string().min(1),
  tenantName: z.string().min(1),
  amount: z.string().min(1),
  invoiceUrl: z.string().url(),
});

export const GenericInviteInput = z.object({
  toName: z.string().min(1),
  tenantName: z.string().min(1),
  role: z.enum(['pro', 'customer', 'employee', 'admin']),
  inviteUrl: z.string().url(),
});

export const OtpCodeInput = z.object({
  code: z.string().min(4).max(10),
});

export type TenantPendingReceived = z.infer<typeof TenantPendingReceivedInput>;
export type TenantApproved = z.infer<typeof TenantApprovedInput>;
export type TenantRejected = z.infer<typeof TenantRejectedInput>;
export type DocumentRequested = z.infer<typeof DocumentRequestedInput>;
export type DocumentApproved = z.infer<typeof DocumentApprovedInput>;
export type RenewalReminder = z.infer<typeof RenewalReminderInput>;
export type InvoiceDue = z.infer<typeof InvoiceDueInput>;
export type GenericInvite = z.infer<typeof GenericInviteInput>;
export type OtpCode = z.infer<typeof OtpCodeInput>;
