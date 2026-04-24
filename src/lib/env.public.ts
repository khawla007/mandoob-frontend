import { z } from 'zod';

const optionalStr = z.preprocess(
  (v) => (typeof v === 'string' && v.length === 0 ? undefined : v),
  z.string().min(1).optional(),
);

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(3),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalStr,
  NEXT_PUBLIC_POSTHOG_KEY: optionalStr,
});

const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
};

const result = schema.safeParse(raw);
if (!result.success) {
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid public environment variables — ${issues}`);
}

export const publicEnv = result.data;
export type PublicEnv = typeof publicEnv;
