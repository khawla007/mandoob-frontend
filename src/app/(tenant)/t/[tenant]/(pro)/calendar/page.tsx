import { getLocale, getTranslations } from 'next-intl/server';
import { MeetingCalendarPanel } from '@/components/operations/MeetingCalendarPanel';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { listMeetingsForCompany } from '@/lib/data/meetings';

export const dynamic = 'force-dynamic';

export default async function ProCalendarPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, session } = await requireProTenantRouteAccess(slug);
  const [company, t, locale] = await Promise.all([
    readAssignedCompanyForPro(session.id, slug),
    getTranslations('meetingOperations'),
    getLocale(),
  ]);
  const meetings = company
    ? await listMeetingsForCompany(company.id, {
        id: session.id,
        role: 'pro',
        tenantId: tenant.id,
      })
    : [];
  return (
    <div className="signal-dashboard min-w-0 space-y-5">
      <DashboardPageHeader title={t('calendarTitle')} description={t('calendarDescription')} />
      <MeetingCalendarPanel
        meetings={meetings}
        locale={locale}
        title={t('upcoming')}
        description={t('pro.createDescription')}
        emptyLabel={t('noUpcoming')}
        joinLabel={t('join')}
        recordingLabel={t('recording')}
        durationLabel={(minutes) => t('duration', { minutes })}
        statusLabel={(status) => t(`statuses.${status}`)}
      />
    </div>
  );
}
