import { SmsOtpCodeInput, type SmsOtpCode } from '@/lib/validation/sms-templates';
import type { SmsTemplateDefinition } from './index';

export const otpCode: SmsTemplateDefinition<SmsOtpCode> = {
  id: 'otp-code',
  schema: SmsOtpCodeInput,
  render(input) {
    const body = `Your verification code is ${input.code}. It expires in 10 minutes.`;
    return { body, multiSegment: false };
  },
};
