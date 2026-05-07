import type {
  TenantPendingReceived,
  TenantApproved,
  TenantRejected,
  DocumentRequested,
  DocumentApproved,
  RenewalReminder,
  InvoiceDue,
  SubscriptionWelcome,
  SubscriptionReceipt,
  SubscriptionSuspension,
  GenericInvite,
  OtpCode,
} from '@/lib/validation/email-templates';
import { tenantPendingReceived } from './tenant-pending-received';
import { tenantApproved } from './tenant-approved';
import { tenantRejected } from './tenant-rejected';
import { documentRequested } from './document-requested';
import { documentApproved } from './document-approved';
import { renewalReminder } from './renewal-reminder';
import { invoiceDue } from './invoice-due';
import { subscriptionWelcome } from './subscription-welcome';
import { subscriptionReceipt } from './subscription-receipt';
import { subscriptionSuspension } from './subscription-suspension';
import { genericInvite } from './generic-invite';
import { otpCode } from './otp-code';

export type Rendered = { subject: string; html: string; text?: string };

export type TemplateMap = {
  'tenant-pending-received': TenantPendingReceived;
  'tenant-approved': TenantApproved;
  'tenant-rejected': TenantRejected;
  'document-requested': DocumentRequested;
  'document-approved': DocumentApproved;
  'renewal-reminder': RenewalReminder;
  'invoice-due': InvoiceDue;
  'subscription-welcome': SubscriptionWelcome;
  'subscription-receipt': SubscriptionReceipt;
  'subscription-suspension': SubscriptionSuspension;
  'generic-invite': GenericInvite;
  'otp-code': OtpCode;
};
export type TemplateId = keyof TemplateMap;
export type TemplateInputFor<T extends TemplateId> = TemplateMap[T];

const registry: { [K in TemplateId]: (input: TemplateMap[K]) => Rendered } = {
  'tenant-pending-received': tenantPendingReceived,
  'tenant-approved': tenantApproved,
  'tenant-rejected': tenantRejected,
  'document-requested': documentRequested,
  'document-approved': documentApproved,
  'renewal-reminder': renewalReminder,
  'invoice-due': invoiceDue,
  'subscription-welcome': subscriptionWelcome,
  'subscription-receipt': subscriptionReceipt,
  'subscription-suspension': subscriptionSuspension,
  'generic-invite': genericInvite,
  'otp-code': otpCode,
};

export function renderTemplate<T extends TemplateId>(id: T, input: TemplateMap[T]): Rendered {
  return registry[id](input);
}
