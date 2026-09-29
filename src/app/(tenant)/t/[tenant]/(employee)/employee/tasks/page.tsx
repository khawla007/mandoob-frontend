import { getTranslations } from 'next-intl/server';
import { OperationalUnavailableRoute } from '@/components/operations/OperationalUnavailableRoute';
import { EmployeeTaskList } from '@/components/employee/EmployeeP308Sections';
import { authorizeEmployeePortalRead } from '@/lib/data/employee-portal-workspace';
import { loadEmployeeTasks } from '@/lib/employees/self-service';

export const dynamic = 'force-dynamic';

export default async function EmployeeTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const baseHref = `/t/${encodeURIComponent(slug)}/employee/tasks`;
  const [tasks, t] = await Promise.all([
    loadEmployeeTasks(access),
    getTranslations('p308.employeeSelf'),
  ]);
  return (
    <div className="space-y-5">
      <EmployeeTaskList tasks={tasks} t={t} />
      {/* Persistent assignable tasks are a P3.10 capability and remain unavailable. */}
      <OperationalUnavailableRoute
        role="employee"
        module="tasks"
        baseHref={baseHref}
        search={await searchParams}
      />
    </div>
  );
}
