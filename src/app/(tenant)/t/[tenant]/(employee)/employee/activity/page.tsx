import { getLocale, getTranslations } from 'next-intl/server';
import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { EmployeeActivityList } from '@/components/employee/EmployeeP308Sections';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';
import { loadEmployeeActivity } from '@/lib/employees/self-service';

export const dynamic = 'force-dynamic';

export default async function EmployeeActivityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [items, t, locale] = await Promise.all([
    loadEmployeeActivity(access),
    getTranslations('p308.employeeSelf'),
    getLocale(),
  ]);
  return (
    <div className="space-y-5">
      <EmployeeActivityList items={items} t={t} locale={locale} />
      {/* Cross-module activity (communications, meetings) depends on P3.10/P3.11. */}
      <OperationalUnavailableRoute
        role="employee"
        module="activity"
        baseHref={`/t/${encodeURIComponent(slug)}/employee/activity`}
      />
    </div>
  );
}
