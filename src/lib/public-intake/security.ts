import { createHash, createHmac } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

export function hashRequest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function hashOpaqueCredential(credential: string, pepper: string): string {
  if (credential.length < 1 || pepper.length < 16) throw new Error('Invalid credential hash input');
  return createHmac('sha256', pepper).update(`p3.05:resume:${credential}`).digest('hex');
}

export function normalizePublicText(value: string, maxCodePoints: number): string {
  const withoutControls = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '');
  const plain = sanitizeHtml(withoutControls, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/gu, ' ')
    .trim();
  if (Array.from(plain).length > maxCodePoints) throw new Error('Public text is too long');
  return /^[=+\-@]/u.test(plain) ? `'${plain}` : plain;
}

export function isAllowedPublicOrigin(origin: string | null, configuredAppUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(configuredAppUrl).origin;
  } catch {
    return false;
  }
}

type TurnstileInput = {
  token: string;
  secret: string;
  expectedHostname: string;
  expectedAction: string;
  remoteIp?: string;
};

type TurnstileDeps = { fetch?: typeof fetch };

export async function verifyPublicTurnstile(
  input: TurnstileInput,
  deps: TurnstileDeps = {},
): Promise<boolean> {
  if (!input.secret || !input.token || input.token.length > 2048) return false;
  const body = new URLSearchParams({ secret: input.secret, response: input.token });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);
  try {
    const response = await (deps.fetch ?? fetch)(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    return (
      result.success === true &&
      result.hostname === input.expectedHostname &&
      result.action === input.expectedAction
    );
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}
