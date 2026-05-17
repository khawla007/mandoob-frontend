import type { SubscriptionSuspension } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function subscriptionSuspension(input: SubscriptionSuspension): Rendered {
  return {
    subject: `${input.tenantName} subscription payment failed`,
    html: `<p>Your Mandoob subscription payment failed and the tenant is suspended.</p><p><a href="${input.billingUrl}">Update billing details</a></p>`,
    text: `Your Mandoob subscription payment failed and the tenant is suspended. Update billing details: ${input.billingUrl}`,
  };
}

