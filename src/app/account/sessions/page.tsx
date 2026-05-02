import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-user';
import { listUserSessions } from '@/lib/auth/sessions';
import { SessionsList } from '@/components/account/SessionsList';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const session = await requireUser();
  if (session.role !== 'super_admin' && session.role !== 'pro') notFound();
  const sessions = await listUserSessions(session.id);
  return <SessionsList sessions={sessions} />;
}
