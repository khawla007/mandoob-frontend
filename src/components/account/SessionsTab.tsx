import { getTranslations } from 'next-intl/server';
import { requireAccountUser } from '@/lib/auth/require-account-user';
import { listUserSessions } from '@/lib/auth/sessions';
import { SessionsList } from './SessionsList';

export async function SessionsTab() {
  const session = await requireAccountUser();
  const [sessions, t] = await Promise.all([
    listUserSessions(session.id),
    getTranslations('account'),
  ]);
  return (
    <section aria-labelledby="sessions-heading" className="space-y-4">
      <h2 id="sessions-heading" className="text-lg font-medium">
        {t('tabSessions')}
      </h2>
      <SessionsList sessions={sessions} />
    </section>
  );
}
