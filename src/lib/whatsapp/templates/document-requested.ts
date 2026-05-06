import {
  WhatsAppDocumentRequestedInput,
  type WhatsAppDocumentRequested,
} from '@/lib/validation/whatsapp-templates';
import type { WhatsAppTemplateDefinition, MetaComponent } from './index';

const META_TEMPLATE_NAME = 'document_requested';
const META_LANGUAGE = 'en';

export const documentRequested: WhatsAppTemplateDefinition<WhatsAppDocumentRequested> = {
  id: 'document-requested',
  metaTemplateName: META_TEMPLATE_NAME,
  language: META_LANGUAGE,
  schema: WhatsAppDocumentRequestedInput,
  buildComponents(input): MetaComponent[] {
    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: input.customerName },
          { type: 'text', text: input.documentLabel },
          { type: 'text', text: input.tenantName },
          { type: 'text', text: input.dueDate ?? 'as soon as possible' },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: input.uploadPath }],
      },
    ];
  },
};
