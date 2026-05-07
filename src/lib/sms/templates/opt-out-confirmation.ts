import { SmsOptOutConfirmationInput, type SmsOptOutConfirmation } from '@/lib/validation/sms-templates';
import type { SmsTemplateDefinition } from './index';

export const optOutConfirmation: SmsTemplateDefinition<SmsOptOutConfirmation> = {
  id: 'opt-out-confirmation',
  schema: SmsOptOutConfirmationInput,
  render: () => ({
    body: 'Your Mandoob communication preference has been updated.',
    multiSegment: false,
  }),
};
