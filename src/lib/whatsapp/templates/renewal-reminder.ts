import {
  WhatsAppRenewalReminderInput,
  type WhatsAppRenewalReminder,
} from '@/lib/validation/whatsapp-templates';
import type { WhatsAppTemplateDefinition, MetaComponent } from './index';

const META_TEMPLATE_NAME = 'renewal_reminder';
const META_LANGUAGE = 'en';

function headlineFor(daysOut: 30 | 7 | 1): string {
  if (daysOut === 30) return 'in 30 days';
  if (daysOut === 7) return 'in 7 days';
  return 'tomorrow';
}

export const renewalReminder: WhatsAppTemplateDefinition<WhatsAppRenewalReminder> = {
  id: 'renewal-reminder',
  metaTemplateName: META_TEMPLATE_NAME,
  language: META_LANGUAGE,
  schema: WhatsAppRenewalReminderInput,
  buildComponents(input): MetaComponent[] {
    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: input.customerName },
          { type: 'text', text: input.renewalLabel },
          { type: 'text', text: input.tenantName },
          { type: 'text', text: input.dueDate },
          { type: 'text', text: headlineFor(input.daysOut) },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: input.detailPath }],
      },
    ];
  },
};
