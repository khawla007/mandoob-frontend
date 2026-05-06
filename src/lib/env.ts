import 'server-only';
import { z } from 'zod';

const optionalStr = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().min(1).optional(),
);
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().email().optional(),
);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(3),

  RESEND_API_KEY: optionalStr,
  RESEND_FROM_EMAIL: optionalEmail,

  TWILIO_ACCOUNT_SID: optionalStr,
  TWILIO_AUTH_TOKEN: optionalStr,
  TWILIO_MESSAGING_SERVICE_SID: optionalStr,
  TWILIO_FROM_NUMBER: optionalStr,

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

  SENTRY_DSN: optionalStr,
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid server environment variables — ${issues}`);
}

export const env = result.data;
export type Env = typeof env;
