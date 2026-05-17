import { WhatsAppOptOutConfirmationInput, type WhatsAppOptOutConfirmation } from '@/lib/validation/whatsapp-templates';
import type { WhatsAppTemplateDefinition } from './index';

export const optOutConfirmation: WhatsAppTemplateDefinition<WhatsAppOptOutConfirmation> = {
  id: 'opt-out-confirmation',
  metaTemplateName: 'mandoob_opt_out_confirmation',
  language: 'en',
  schema: WhatsAppOptOutConfirmationInput,
  buildComponents: () => [
    {
      type: 'body',
      parameters: [{ type: 'text', text: 'Your Mandoob communication preference has been updated.' }],
    },
  ],
};
