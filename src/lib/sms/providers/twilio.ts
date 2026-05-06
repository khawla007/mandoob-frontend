import 'server-only';
import type { TwilioCredentials } from '../config';

export type TwilioSendInput = {
  credentials: TwilioCredentials;
  toPhone: string;
  body: string;
  senderId: string;
  statusCallback?: string;
};

export type TwilioSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export async function sendViaTwilio(input: TwilioSendInput): Promise<TwilioSendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    input.credentials.account_sid,
  )}/Messages.json`;

  const form = new URLSearchParams();
  form.set('To', input.toPhone);
  form.set('Body', input.body);
  // senderId is either a Messaging Service SID (MGxxx) or an E.164 from-number.
  if (input.senderId.startsWith('MG')) form.set('MessagingServiceSid', input.senderId);
  else form.set('From', input.senderId);
  if (input.statusCallback) form.set('StatusCallback', input.statusCallback);

  const auth = Buffer.from(
    `${input.credentials.account_sid}:${input.credentials.auth_token}`,
  ).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (res.ok) {
    const sid = extractSid(payload);
    if (!sid) return { ok: false, error: 'missing sid in Twilio response', retryable: false };
    return { ok: true, providerMessageId: sid };
  }
  return mapTwilioError(res.status, payload);
}

function extractSid(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const sid = (payload as { sid?: unknown }).sid;
  return typeof sid === 'string' ? sid : null;
}

export function mapTwilioError(status: number, payload: unknown): TwilioSendResult {
  const errObj =
    payload && typeof payload === 'object'
      ? (payload as { code?: number; message?: string; status?: number })
      : undefined;
  const code = errObj?.code;
  const message = errObj?.message ?? `Twilio HTTP ${status}`;

  if (status >= 500 || status === 429) {
    return { ok: false, error: message, retryable: true };
  }
  // 20003 auth, 21211 invalid To, 21610 unsubscribed, 21614 not a mobile — all non-retryable.
  if (typeof code === 'number') {
    return { ok: false, error: message, retryable: false };
  }
  return { ok: false, error: message, retryable: false };
}
