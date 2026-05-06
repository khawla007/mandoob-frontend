import { WhatsAppOtpCodeInput, type WhatsAppOtpCode } from '@/lib/validation/whatsapp-templates';
import type { WhatsAppTemplateDefinition, MetaComponent } from './index';

const META_TEMPLATE_NAME = 'otp_code';
const META_LANGUAGE = 'en';

export const otpCode: WhatsAppTemplateDefinition<WhatsAppOtpCode> = {
  id: 'otp-code',
  metaTemplateName: META_TEMPLATE_NAME,
  language: META_LANGUAGE,
  schema: WhatsAppOtpCodeInput,
  buildComponents(input): MetaComponent[] {
    return [
      {
        type: 'body',
        parameters: [{ type: 'text', text: input.code }],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: input.code }],
      },
    ];
  },
};
