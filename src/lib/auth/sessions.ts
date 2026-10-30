import 'server-only';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

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

type StoreResult<T> = Promise<{ data: T | null; error: unknown }>;

export type SessionStore = {
  list: (userId: string) => StoreResult<RawSessionRow[]>;
  revoke: (userId: string, sessionId: string) => StoreResult<boolean>;
};

function createSessionStore(): SessionStore {
  const admin = createSupabaseServiceRoleClient();
  return {
    list: async (userId) =>
      admin
        .from('admin_active_sessions')
        .select('id, user_id, user_agent, ip, refreshed_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    revoke: async (userId, sessionId) =>
      admin.rpc('revoke_user_auth_session', {
        p_user_id: userId,
        p_session_id: sessionId,
      }),
  };
}

export async function listUserSessionsWith(
  store: SessionStore,
  userId: string,
): Promise<SessionSummary[]> {
  const { data, error } = await store.list(userId);
  if (error || !data) throw new ApiError('INTERNAL', 'Could not list sessions', 500);
  return data.map(parseSessionRow);
}

export async function listUserSessions(userId: string): Promise<SessionSummary[]> {
  return listUserSessionsWith(createSessionStore(), userId);
}

export async function revokeSessionByIdWith(
  store: SessionStore,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { data, error } = await store.revoke(userId, sessionId);
  if (error) throw new ApiError('INTERNAL', 'Could not revoke session', 500);
  if (data !== true) throw new ApiError('FORBIDDEN', 'Session is unavailable', 403);
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<void> {
  return revokeSessionByIdWith(createSessionStore(), userId, sessionId);
}
