import type { SubscriptionWelcome } from '@/lib/validation/email-templates';
import type { Rendered } from './index';

export function subscriptionWelcome(input: SubscriptionWelcome): Rendered {
  return {
    subject: `${input.tenantName} billing setup`,
    html: `<p>Hello ${input.adminName},</p><p>Your PRO firm has been approved. Choose a Mandoob plan to activate subscription billing.</p><p><a href="${input.pricingUrl}">Choose a plan</a></p>`,
    text: `Hello ${input.adminName}, your PRO firm has been approved. Choose a plan: ${input.pricingUrl}`,
  };
}

