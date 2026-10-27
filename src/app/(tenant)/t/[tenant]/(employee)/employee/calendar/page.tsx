import { getLocale, getTranslations } from 'next-intl/server';
import { MeetingCalendarPanel } from '@/components/operations/MeetingCalendarPanel';
import { EmployeeRenewalCalendar } from '@/components/employee/EmployeeP308Sections';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';
import { loadEmployeeRenewalCalendar } from '@/lib/employees/self-service';
import { listMeetingsForEmployee } from '@/lib/data/meetings';
import { dubaiBusinessDate } from '@/lib/renewals/dubai-calendar';

export const dynamic = 'force-dynamic';

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export default async function EmployeeCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const search = await searchParams;
  const rawMonth = Array.isArray(search.month) ? search.month[0] : search.month;
  const month =
    rawMonth && /^\d{4}-(0[1-9]|1[0-2])$/u.test(rawMonth)
      ? rawMonth
      : dubaiBusinessDate().slice(0, 7);
  const baseHref = `/t/${encodeURIComponent(slug)}/employee/calendar`;
  const [calendar, meetings, t, meetingT, locale] = await Promise.all([
    loadEmployeeRenewalCalendar(access, month),
    listMeetingsForEmployee(access.session.id, access.tenant.id, access.employee.companyId),
    getTranslations('p308.employeeSelf'),
    getTranslations('meetingOperations'),
    getLocale(),
  ]);
  return (
    <div className="space-y-5">
      <EmployeeRenewalCalendar
        month={calendar}
        t={t}
        locale={locale}
        previousHref={`${baseHref}?month=${shiftMonth(month, -1)}`}
        nextHref={`${baseHref}?month=${shiftMonth(month, 1)}`}
      />
      <MeetingCalendarPanel
        meetings={meetings}
        locale={locale}
        title={meetingT('calendarTitle')}
        description={meetingT('employeeDescription')}
        emptyLabel={meetingT('noCustomerMeetings')}
        joinLabel={meetingT('join')}
        recordingLabel={meetingT('recording')}
        durationLabel={(minutes) => meetingT('duration', { minutes })}
        statusLabel={(status) => meetingT(`statuses.${status}`)}
      />
    </div>
  );
}
