import { z } from 'zod';

import { getClientIp } from '@/lib/auth/request';
import { env } from '@/lib/env';
import { consumeSensitiveRateLimit } from '@/lib/rate-limit';
import { acceptPublicContact, type AcceptContactInput } from '@/lib/public-intake/service';
import {
  hashRequest,
  isAllowedPublicOrigin,
  verifyPublicTurnstile,
} from '@/lib/public-intake/security';
import { validateContactSubmission } from '@/lib/public-contact/validation';

const MAX_BODY_BYTES = 16_384;
const requestSchema = z
  .object({
    operationId: z.string().uuid(),
    turnstileToken: z.string().min(1).max(2048),
    contact: z.object({
      fullName: z.string(),
      email: z.string(),
      phone: z.string(),
      subject: z.string(),
      message: z.string(),
      consent: z.boolean(),
    }),
  })
  .strict();

type Deps = {
  appUrl?: string;
  turnstileSecret?: string;
  rateLimit?: (key: string) => Promise<'allowed' | 'limited' | 'unavailable'>;
  verifyTurnstile?: typeof verifyPublicTurnstile;
  accept?: (input: AcceptContactInput) => Promise<{
    contactId: string;
    accepted: true;
    deliveryState: 'pending' | 'suppressed' | 'unavailable' | 'delivered';
  }>;
};

export async function handlePublicContactPost(request: Request, deps: Deps = {}) {
  const appUrl = deps.appUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !isAllowedPublicOrigin(request.headers.get('origin'), appUrl)) {
    return response({ status: 'failure', sent: false, retryable: false, message: 'Request origin is not allowed.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return response({ status: 'failure', sent: false, retryable: false, message: 'Request is too large.' }, 413);
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return response({ status: 'failure', sent: false, retryable: false, message: 'Invalid request.' }, 400);
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return response({ status: 'failure', sent: false, retryable: false, message: 'Invalid request.' }, 400);
  }
  const validated = validateContactSubmission(parsed.data.contact);
  if (!validated.ok) {
    return response({ status: 'failure', sent: false, retryable: false, message: 'Invalid contact details.' }, 400);
  }
  const ip = getClientIp(request);
  const rateLimit = deps.rateLimit ?? ((key: string) => consumeSensitiveRateLimit({
    key,
    capacity: 8,
    refillPerSec: 8 / 3600,
    routeLabel: 'public-contact',
    correlationId: parsed.data.operationId,
  }));
  const identityHash = hashRequest(validated.data.email);
  const [ipLimit, identityLimit] = await Promise.all([
    rateLimit(`p305:contact:ip:${hashRequest(ip)}`),
    rateLimit(`p305:contact:identity:${identityHash}`),
  ]);
  if (ipLimit === 'limited' || identityLimit === 'limited') {
    return response({ status: 'rate_limited', sent: false, retryAfterSeconds: 3600, message: 'Please wait before trying again.' }, 429);
  }
  if (ipLimit === 'unavailable' || identityLimit === 'unavailable') {
    return response({ status: 'unavailable', sent: false, message: 'Contact intake is temporarily unavailable.' }, 503);
  }
  const secret = deps.turnstileSecret ?? env.TURNSTILE_SECRET_KEY;
  if (!secret && process.env.NODE_ENV === 'production') {
    return response({ status: 'unavailable', sent: false, message: 'Contact verification is unavailable.' }, 503);
  }
  if (secret) {
    const verified = await (deps.verifyTurnstile ?? verifyPublicTurnstile)({
      token: parsed.data.turnstileToken,
      secret,
      expectedHostname: new URL(appUrl).hostname,
      expectedAction: 'contact',
      remoteIp: ip,
    });
    if (!verified) {
      return response({ status: 'failure', sent: false, retryable: true, message: 'Verification failed. Please try again.' }, 400);
    }
  }
  try {
    const accepted = await (deps.accept ?? acceptPublicContact)({
      operationId: parsed.data.operationId,
      contact: validated.data,
      abuseScopeHash: hashRequest({ ip, identityHash }),
      acceptedAt: new Date().toISOString(),
    });
    return response({
      status: 'success',
      sent: accepted.deliveryState === 'delivered',
      deliveryState: accepted.deliveryState,
      message: accepted.deliveryState === 'delivered'
        ? 'Your message was accepted and delivered.'
        : 'Your message was accepted. Acknowledgement delivery is pending.',
    }, 202);
  } catch {
    return response({ status: 'unavailable', sent: false, message: 'Contact intake is temporarily unavailable.' }, 503);
  }
}

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
