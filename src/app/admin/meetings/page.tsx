import { getLocale, getTranslations } from 'next-intl/server';
import { MeetingCalendarPanel } from '@/components/operations/MeetingCalendarPanel';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { listMeetingsForPlatform, type MeetingActor } from '@/lib/data/meetings';

export const dynamic = 'force-dynamic';

export default async function AdminMeetingsPage() {
  const session = await requirePlatformOperator();
  const [t, locale] = await Promise.all([getTranslations('meetingOperations'), getLocale()]);
  const meetings = await listMeetingsForPlatform({
    id: session.id,
    role: session.role as MeetingActor['role'],
    tenantId: null,
  });
  return (
    <div className="signal-dashboard min-w-0 space-y-5">
      <DashboardPageHeader title={t('title')} description={t('adminDescription')} />
      <MeetingCalendarPanel
        meetings={meetings}
        locale={locale}
        title={t('calendarTitle')}
        description={t('calendarDescription')}
        emptyLabel={t('noCustomerMeetings')}
        joinLabel={t('join')}
        recordingLabel={t('recording')}
        durationLabel={(minutes) => t('duration', { minutes })}
        statusLabel={(status) => t(`statuses.${status}`)}
      />
    </div>
  );
}
