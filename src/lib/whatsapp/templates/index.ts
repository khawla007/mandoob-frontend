import type { ZodType } from 'zod';
import type {
  WhatsAppRenewalReminder,
  WhatsAppDocumentRequested,
  WhatsAppOtpCode,
} from '@/lib/validation/whatsapp-templates';
import { renewalReminder } from './renewal-reminder';
import { documentRequested } from './document-requested';
import { otpCode } from './otp-code';

export type MetaTextParameter = { type: 'text'; text: string };
export type MetaBodyComponent = {
  type: 'body';
  parameters: MetaTextParameter[];
};
export type MetaButtonComponent = {
  type: 'button';
  sub_type: 'url' | 'quick_reply';
  index: string;
  parameters: MetaTextParameter[];
};
export type MetaComponent = MetaBodyComponent | MetaButtonComponent;

export type WhatsAppTemplateMap = {
  'renewal-reminder': WhatsAppRenewalReminder;
  'document-requested': WhatsAppDocumentRequested;
  'otp-code': WhatsAppOtpCode;
};
export type WhatsAppTemplateId = keyof WhatsAppTemplateMap;
export type WhatsAppTemplateInputFor<T extends WhatsAppTemplateId> = WhatsAppTemplateMap[T];

export type WhatsAppTemplateDefinition<TInput> = {
  id: WhatsAppTemplateId;
  metaTemplateName: string;
  language: string;
  schema: ZodType<TInput>;
  buildComponents: (input: TInput) => MetaComponent[];
};

export type RenderedWhatsApp = {
  metaTemplateName: string;
  language: string;
  components: MetaComponent[];
};

const registry: { [K in WhatsAppTemplateId]: WhatsAppTemplateDefinition<WhatsAppTemplateMap[K]> } =
  {
    'renewal-reminder': renewalReminder,
    'document-requested': documentRequested,
    'otp-code': otpCode,
  };

export function renderWhatsAppTemplate<T extends WhatsAppTemplateId>(
  id: T,
  input: WhatsAppTemplateMap[T],
): RenderedWhatsApp {
  const def = registry[id];
  const parsed = def.schema.parse(input);
  return {
    metaTemplateName: def.metaTemplateName,
    language: def.language,
    components: def.buildComponents(parsed),
  };
}
