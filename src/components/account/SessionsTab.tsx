import { getTranslations } from 'next-intl/server';
import { requireUser } from '@/lib/auth/require-user';
import {
  isSessionManagementUnavailableError,
  listUserSessions,
  type SessionSummary,
} from '@/lib/auth/sessions';
import { SessionsList } from './SessionsList';

export async function SessionsTab() {
  const session = await requireUser();
  let sessions: SessionSummary[] | null = null;
  try {
    sessions = await listUserSessions(session.id);
  } catch (error) {
    if (!isSessionManagementUnavailableError(error)) throw error;
  }
  if (sessions) return <SessionsList sessions={sessions} />;

  const [tAccount, tCustomerAccount] = await Promise.all([
    getTranslations('account'),
    getTranslations('customer.settings.account'),
  ]);
  return (
    <section
      aria-labelledby="sessions-unavailable-heading"
      className="bg-muted/30 rounded-lg border border-dashed p-6"
    >
      <h2 id="sessions-unavailable-heading" className="text-lg font-medium">
        {tAccount('tabSessions')}
      </h2>
      <p role="status" className="text-muted-foreground mt-2 text-sm">
        {tCustomerAccount('sessionsUnavailable')}
      </p>
    </section>
  );
}
