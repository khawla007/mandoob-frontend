import 'server-only';
import type { MetaComponent } from './templates';
import type { TenantWhatsAppConfig } from './config';

const META_API_VERSION = 'v21.0';

const RATE_LIMIT_CODES = new Set([130429, 131056]);
const NON_RETRYABLE_CODES = new Set([131047]);

export type SendTemplateInput = {
  tenantConfig: TenantWhatsAppConfig;
  toPhone: string;
  templateName: string;
  language: string;
  components: MetaComponent[];
};

export type SendTemplateResult =
  | { ok: true; wamid: string }
  | { ok: false; error: string; retryable: boolean };

export async function sendTemplateMessage(input: SendTemplateInput): Promise<SendTemplateResult> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${input.tenantConfig.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: input.toPhone,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.language },
      components: input.components,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.tenantConfig.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    const wamid = extractWamid(payload);
    if (!wamid) return { ok: false, error: 'missing wamid in response', retryable: false };
    return { ok: true, wamid };
  }

  return mapMetaError(res.status, payload);
}

function extractWamid(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as { messages?: Array<{ id?: string }> };
  return obj.messages?.[0]?.id ?? null;
}

export function mapMetaError(status: number, payload: unknown): SendTemplateResult {
  const errObj =
    payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { message?: string; code?: number } }).error
      : undefined;
  const code = errObj?.code;
  const message = errObj?.message ?? `Meta HTTP ${status}`;

  if (status >= 500) return { ok: false, error: message, retryable: true };
  if (typeof code === 'number' && RATE_LIMIT_CODES.has(code)) {
    return { ok: false, error: message, retryable: true };
  }
  if (typeof code === 'number' && NON_RETRYABLE_CODES.has(code)) {
    return { ok: false, error: message, retryable: false };
  }
  return { ok: false, error: message, retryable: false };
}
