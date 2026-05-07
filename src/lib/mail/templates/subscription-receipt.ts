import type { SubscriptionReceipt } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function subscriptionReceipt(input: SubscriptionReceipt): Rendered {
  return {
    subject: `Subscription receipt — ${input.amount}`,
    html: `<p>Your ${input.plan} subscription payment for ${input.tenantName} was received.</p><p>Amount: ${input.amount}</p><p><a href="${input.receiptUrl}">View receipt</a></p>`,
    text: `Your ${input.plan} subscription payment for ${input.tenantName} was received. Amount: ${input.amount}. Receipt: ${input.receiptUrl}`,
  };
}

