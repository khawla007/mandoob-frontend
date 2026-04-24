import 'server-only';
import { Resend } from 'resend';
import { env } from '@/lib/env';

export function getResend(): Resend {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');
  return new Resend(env.RESEND_API_KEY);
}

export const DEFAULT_FROM = env.RESEND_FROM_EMAIL ?? 'no-reply@mail.fanaticcoders.com';
