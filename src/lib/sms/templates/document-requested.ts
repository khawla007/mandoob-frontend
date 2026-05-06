import {
  SmsDocumentRequestedInput,
  type SmsDocumentRequested,
} from '@/lib/validation/sms-templates';
import type { SmsTemplateDefinition } from './index';

export const documentRequested: SmsTemplateDefinition<SmsDocumentRequested> = {
  id: 'document-requested',
  schema: SmsDocumentRequestedInput,
  render(input) {
    const due = input.dueDate ?? 'as soon as possible';
    const body = `${input.tenantName}: please upload ${input.documentLabel} (${due}). ${input.uploadUrl}`;
    return { body, multiSegment: body.length > 160 };
  },
};
