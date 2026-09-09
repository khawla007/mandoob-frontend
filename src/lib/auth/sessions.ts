import 'server-only';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';

export type SessionSummary = {
  id: string;
  userId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
};

type RawSessionRow = {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  refreshed_at: string | null;
  created_at: string;
};

export function parseSessionRow(row: RawSessionRow): SessionSummary {
  return {
    id: row.id,
    userId: row.user_id,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastSeenAt: row.refreshed_at ?? row.created_at,
  };
}

export function isSessionManagementUnavailableError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.code === 'SESSION_MANAGEMENT_UNAVAILABLE' &&
    error.status === 503
  );
}

function adminUrl(path: string): string {
  return `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin${path}`;
}

function adminHeaders(): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function isUnsupportedSessionsEndpointResponse(response: Response): Promise<boolean> {
  if (response.status !== 404) return false;
  if (response.headers.get('content-type')?.toLowerCase() !== 'text/plain; charset=utf-8') {
    return false;
  }
  return (await readBoundedText(response, 64)) === '404 page not found\n';
}

export async function listUserSessions(userId: string): Promise<SessionSummary[]> {
  const res = await fetch(adminUrl(`/users/${encodeURIComponent(userId)}/sessions`), {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (await isUnsupportedSessionsEndpointResponse(res)) {
    throw new ApiError(
      'SESSION_MANAGEMENT_UNAVAILABLE',
      'Session management endpoint is unavailable',
      503,
    );
  }
  if (!res.ok) throw new ApiError('INTERNAL', `listUserSessions failed: ${res.status}`, 500);
  const body = (await res.json()) as { sessions?: RawSessionRow[] };
  return (body.sessions ?? []).map(parseSessionRow);
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<void> {
  const res = await fetch(adminUrl(`/sessions/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError('INTERNAL', `revokeSessionById failed: ${res.status} ${detail}`, 500);
  }
  void userId;
}
