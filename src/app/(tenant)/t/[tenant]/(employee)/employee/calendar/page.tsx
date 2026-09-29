import { getLocale, getTranslations } from 'next-intl/server';
import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { EmployeeRenewalCalendar } from '@/components/employee/EmployeeP308Sections';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';
import { loadEmployeeRenewalCalendar } from '@/lib/employees/self-service';
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
  const [calendar, t, locale] = await Promise.all([
    loadEmployeeRenewalCalendar(access, month),
    getTranslations('p308.employeeSelf'),
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
      {/* Meetings and follow-ups belong to P3.11; they stay truthfully unavailable. */}
      <OperationalUnavailableRoute
        role="employee"
        module="calendar"
        baseHref={baseHref}
        search={search}
      />
    </div>
  );
}
