import {
  WhatsAppLeadAcknowledgementInput,
  type WhatsAppLeadAcknowledgement,
} from '@/lib/validation/whatsapp-templates';
import type { WhatsAppTemplateDefinition } from './index';

export const leadAcknowledgement: WhatsAppTemplateDefinition<WhatsAppLeadAcknowledgement> = {
  id: 'lead-acknowledgement',
  metaTemplateName: 'lead_acknowledgement',
  language: 'en',
  category: 'utility',
  schema: WhatsAppLeadAcknowledgementInput,
  buildComponents: (input) => [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: input.leadName },
        { type: 'text', text: input.tenantName },
        { type: 'text', text: input.leadReference },
      ],
    },
  ],
};
