import type { ZodType } from 'zod';
import type {
  SmsRenewalReminder,
  SmsDocumentRequested,
  SmsOtpCode,
  SmsOptOutConfirmation,
} from '@/lib/validation/sms-templates';
import { renewalReminder } from './renewal-reminder';
import { documentRequested } from './document-requested';
import { otpCode } from './otp-code';
import { optOutConfirmation } from './opt-out-confirmation';

export type SmsTemplateMap = {
  'renewal-reminder': SmsRenewalReminder;
  'document-requested': SmsDocumentRequested;
  'otp-code': SmsOtpCode;
  'opt-out-confirmation': SmsOptOutConfirmation;
};
export type SmsTemplateId = keyof SmsTemplateMap;
export type SmsTemplateInputFor<T extends SmsTemplateId> = SmsTemplateMap[T];

export type RenderedSms = { body: string; multiSegment: boolean };

export type SmsTemplateDefinition<TInput> = {
  id: SmsTemplateId;
  schema: ZodType<TInput>;
  render: (input: TInput) => RenderedSms;
};

const registry: { [K in SmsTemplateId]: SmsTemplateDefinition<SmsTemplateMap[K]> } = {
  'renewal-reminder': renewalReminder,
  'document-requested': documentRequested,
  'otp-code': otpCode,
  'opt-out-confirmation': optOutConfirmation,
};

export function renderSmsTemplate<T extends SmsTemplateId>(
  id: T,
  input: SmsTemplateMap[T],
): RenderedSms {
  const def = registry[id];
  const parsed = def.schema.parse(input);
  return def.render(parsed);
}
