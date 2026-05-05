import { requireUser } from '@/lib/auth/require-user';
import { listUserSessions } from '@/lib/auth/sessions';
import { SessionsList } from './SessionsList';

export async function SessionsTab() {
  const session = await requireUser();
  const sessions = await listUserSessions(session.id);
  return <SessionsList sessions={sessions} />;
}
