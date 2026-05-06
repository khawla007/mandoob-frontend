import { SmsRenewalReminderInput, type SmsRenewalReminder } from '@/lib/validation/sms-templates';
import type { SmsTemplateDefinition } from './index';

function headlineFor(daysOut: 30 | 7 | 1): string {
  if (daysOut === 30) return 'in 30 days';
  if (daysOut === 7) return 'in 7 days';
  return 'tomorrow';
}

export const renewalReminder: SmsTemplateDefinition<SmsRenewalReminder> = {
  id: 'renewal-reminder',
  schema: SmsRenewalReminderInput,
  render(input) {
    const body = `${input.tenantName}: ${input.renewalLabel} for ${input.customerName} due ${input.dueDate} (${headlineFor(input.daysOut)}). ${input.detailUrl}`;
    return { body, multiSegment: body.length > 160 };
  },
};
