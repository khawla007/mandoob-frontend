import 'server-only';
import { z } from 'zod';
import { isExplicitLocalAcceptanceOrigin } from './local-acceptance-origin';

const optionalStr = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().min(1).optional(),
);
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().email().optional(),
);
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().url().optional(),
);
const productionAppUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'must use HTTPS in production');
const explicitLocalAcceptanceOrigin = isExplicitLocalAcceptanceOrigin(process.env);
const appUrlSchema =
  process.env.NODE_ENV === 'production' && !explicitLocalAcceptanceOrigin
    ? productionAppUrl
    : optionalUrl;
const optionalPort = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.coerce.number().int().positive().max(65_535).optional(),
);
const optionalBoolean = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(3),
  NEXT_PUBLIC_APP_URL: appUrlSchema,

  RESEND_API_KEY: optionalStr,
  RESEND_FROM_EMAIL: optionalEmail,

  TWILIO_ACCOUNT_SID: optionalStr,
  TWILIO_AUTH_TOKEN: optionalStr,
  TWILIO_MESSAGING_SERVICE_SID: optionalStr,
  TWILIO_FROM_NUMBER: optionalStr,
  TWILIO_INBOUND_ENABLED: optionalBoolean,
  INBOUND_DESTINATION_HMAC_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
    z.string().min(32).optional(),
  ),

  TURNSTILE_SECRET_KEY: optionalStr,

  ENCRYPTION_KEY: optionalStr,
  SUPABASE_AUTH_WEBHOOK_SECRET: optionalStr,
  CRON_SECRET: optionalStr,

  WHATSAPP_VERIFY_TOKEN: optionalStr,
  WHATSAPP_APP_SECRET: optionalStr,

  UNIFONIC_APP_SID: optionalStr,
  UNIFONIC_WEBHOOK_SECRET: optionalStr,

  TAP_SECRET_KEY: optionalStr,
  TAP_PUBLIC_KEY: optionalStr,
  TAP_WEBHOOK_SECRET: optionalStr,
  TAP_API_BASE: optionalStr,
  TAP_REDIRECT_HOSTS: optionalStr,

  STRIPE_SECRET_KEY: optionalStr,
  STRIPE_PUBLISHABLE_KEY: optionalStr,
  STRIPE_WEBHOOK_SECRET: optionalStr,
  STRIPE_DESTINATION: z.enum(['test', 'sandbox', 'live', 'production']).optional(),

  VIRUSTOTAL_API_KEY: optionalStr,
  CLAMAV_HOST: optionalStr,
  CLAMAV_PORT: optionalPort,

  OPENAI_API_KEY: optionalStr,
  OPENAI_TRANSCRIPTION_MODEL: optionalStr,
  OPENAI_SUMMARY_MODEL: optionalStr,
  MEETING_AI_MAX_RECORDING_BYTES: optionalStr,

  SENTRY_DSN: optionalStr,
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid server environment variables — ${issues}`);
}

export const env = result.data;
export type Env = typeof env;
