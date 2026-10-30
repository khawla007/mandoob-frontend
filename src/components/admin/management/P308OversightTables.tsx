import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { EmployeeView } from '@/lib/employees/privacy';
import type { AdminRenewalRow, RenewalHealth } from '@/lib/renewals/admin-oversight';

type T = (key: string, values?: Record<string, string | number>) => string;

function Pager({
  base,
  page,
  total,
  size,
  t,
}: {
  base: string;
  page: number;
  total: number;
  size: number;
  t: T;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav className="flex items-center justify-between text-sm" aria-label={t('pagination')}>
      <span className="text-muted-foreground">{t('pageOf', { page, pages })}</span>
      <span className="flex gap-3">
        {page > 1 ? (
          <Link className="text-primary" href={`${base}?page=${page - 1}`}>
            {t('previous')}
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="text-primary" href={`${base}?page=${page + 1}`}>
            {t('next')}
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export function AdminRenewalTable({
  rows,
  total,
  page,
  counts,
  health,
  t,
}: {
  rows: AdminRenewalRow[];
  total: number;
  page: number;
  counts: { overdue: number | null; week: number | null; days90: number | null };
  health: RenewalHealth | null;
  t: T;
}) {
  return (
    <section className="space-y-4">
      <dl className="grid gap-2 sm:grid-cols-4">
        {(['overdue', 'week', 'days90'] as const).map((key) => (
          <div key={key} className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs uppercase">{t(`counts.${key}`)}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{counts[key] ?? '—'}</dd>
          </div>
        ))}
        <div className="rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs uppercase">{t('health')}</dt>
          <dd className="text-sm">
            {health === null
              ? t('healthUnavailable')
              : health.stale
                ? t('healthStale', { date: health.last_run?.dubai_date ?? '—' })
                : t('healthFresh', { reminders: health.scheduled_reminders })}
          </dd>
        </div>
      </dl>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/40 border-b text-start">
              <tr>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.company')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.renewal')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.due')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.stage')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.companyName}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.label}</div>
                    <div className="text-muted-foreground text-xs">{t(`types.${row.type}`)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div dir="ltr">{row.dueDate}</div>
                    <Badge variant={row.bucket === 'overdue' ? 'destructive' : 'secondary'}>
                      {t(`buckets.${row.bucket}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{t(`stages.${row.stage}`)}</Badge>
                    {row.blocked ? (
                      <div className="text-destructive text-xs">{t('blocked')}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/renewals" page={page} total={total} size={50} t={t} />
    </section>
  );
}

export function AdminEmployeeTable({
  rows,
  total,
  page,
  counts,
  t,
}: {
  rows: Array<EmployeeView & { companyName: string }>;
  total: number;
  page: number;
  counts: { visaRisk: number | null; eidRisk: number | null };
  t: T;
}) {
  return (
    <section className="space-y-4">
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs uppercase">{t('counts.total')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{total}</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs uppercase">{t('counts.visaRisk')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{counts.visaRisk ?? '—'}</dd>
        </div>
        <div className="rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs uppercase">{t('counts.eidRisk')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{counts.eidRisk ?? '—'}</dd>
        </div>
      </dl>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.company')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.employee')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.identifiers')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.expiries')}
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  {t('columns.status')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.companyName}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-muted-foreground text-xs">{row.jobTitle ?? ''}</div>
                  </td>
                  <td className="px-3 py-2 text-xs" dir="ltr">
                    <div>{row.passport ?? '—'}</div>
                    <div>{row.emiratesId ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs" dir="ltr">
                    <div>
                      {t('visa')}: {row.visaExpiry ?? '—'}
                    </div>
                    <div>
                      {t('eid')}: {row.eidExpiry ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{t(`statuses.${row.status}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager base="/admin/employees" page={page} total={total} size={50} t={t} />
    </section>
  );
}
