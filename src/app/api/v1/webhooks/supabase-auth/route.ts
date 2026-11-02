import { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { errorResponse, jsonOk } from '@/lib/errors';
import {
  BODY_LIMITS,
  BodyTooLargeError,
  decodeBoundedUtf8,
  readBoundedBody,
} from '@/lib/http/bounded-body';
import { recordAuthEvent, type AuthEventKind } from '@/lib/logging/auth-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Map Supabase "send_email_hook" / auth webhook actions to our auth_event_kind.
const ACTION_MAP: Record<string, AuthEventKind> = {
  login: 'login_success',
  logout: 'logout',
  signup: 'login_success',
  password_recovery: 'password_reset_requested',
};

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = env.SUPABASE_AUTH_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!headerSig) return false;
  // Supabase uses standard webhooks header format: t=<ts>,v1=<sig> or just v1=<hex>
  const sig = headerSig.replace(/^v1=/, '').replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  let raw: string;
  try {
    raw = decodeBoundedUtf8(await readBoundedBody(request, BODY_LIMITS.providerWebhook));
  } catch (error) {
    return error instanceof BodyTooLargeError
      ? errorResponse('PAYLOAD_TOO_LARGE', 'request too large', 413)
      : errorResponse('BAD_REQUEST', 'invalid request', 400);
  }
  const sig =
    request.headers.get('webhook-signature') ?? request.headers.get('x-supabase-signature');
  if (!verifySignature(raw, sig)) return errorResponse('INVALID_SIGNATURE', 'bad webhook', 401);

  let event: { type?: string; user?: { id?: string; email?: string } } = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return errorResponse('INVALID_INPUT', 'bad json', 400);
  }

  const kind = event.type ? ACTION_MAP[event.type] : undefined;
  if (kind) {
    await recordAuthEvent({
      kind,
      actorUserId: event.user?.id ?? null,
      details: { email: event.user?.email, via: 'webhook' },
    });
  }

  return jsonOk({ ok: true });
}
