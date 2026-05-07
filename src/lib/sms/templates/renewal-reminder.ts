import { SmsRenewalReminderInput, type SmsRenewalReminder } from '@/lib/validation/sms-templates';
import type { SmsTemplateDefinition } from './index';

function headlineFor(daysOut: SmsRenewalReminder['daysOut']): string {
  return daysOut === 1 ? 'tomorrow' : `in ${daysOut} days`;
}

export const renewalReminder: SmsTemplateDefinition<SmsRenewalReminder> = {
  id: 'renewal-reminder',
  schema: SmsRenewalReminderInput,
  render(input) {
    const body = `${input.tenantName}: ${input.renewalLabel} for ${input.customerName} due ${input.dueDate} (${headlineFor(input.daysOut)}). ${input.detailUrl}`;
    return { body, multiSegment: body.length > 160 };
  },
};
