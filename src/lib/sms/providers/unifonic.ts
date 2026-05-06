import 'server-only';
import type { UnifonicCredentials } from '../config';

export type UnifonicSendInput = {
  credentials: UnifonicCredentials;
  toPhone: string;
  body: string;
  senderId: string;
};

export type UnifonicSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

const UNIFONIC_SEND_URL = 'https://api.unifonic.com/rest/v1/Messages/Send';

export async function sendViaUnifonic(input: UnifonicSendInput): Promise<UnifonicSendResult> {
  const form = new URLSearchParams();
  form.set('AppSid', input.credentials.app_sid);
  // Unifonic expects MSISDN without the leading +.
  form.set('Recipient', input.toPhone.replace(/^\+/, ''));
  form.set('Body', input.body);
  form.set('SenderID', input.senderId);

  let res: Response;
  try {
    res = await fetch(UNIFONIC_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

  if (res.ok && isUnifonicSuccess(payload)) {
    const id = extractUnifonicId(payload);
    if (!id)
      return { ok: false, error: 'missing MessageID in Unifonic response', retryable: false };
    return { ok: true, providerMessageId: id };
  }
  return mapUnifonicError(res.status, payload);
}

type UnifonicEnvelope = { success?: boolean | string; data?: { MessageID?: string | number } };

function isUnifonicSuccess(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const env = payload as UnifonicEnvelope;
  return env.success === true || env.success === 'true';
}

function extractUnifonicId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const env = payload as UnifonicEnvelope;
  const id = env.data?.MessageID;
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return null;
}

export function mapUnifonicError(status: number, payload: unknown): UnifonicSendResult {
  const env =
    payload && typeof payload === 'object'
      ? (payload as { errorCode?: number | string; message?: string })
      : undefined;
  const message = env?.message ?? `Unifonic HTTP ${status}`;

  if (status >= 500 || status === 429) {
    return { ok: false, error: message, retryable: true };
  }
  return { ok: false, error: message, retryable: false };
}
