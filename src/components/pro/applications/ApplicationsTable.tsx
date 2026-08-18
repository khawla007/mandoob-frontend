import { updateApplicationFormAction } from '@/app/(tenant)/t/[tenant]/(pro)/applications/actions';
import type { ServiceCase } from '@/lib/data/service-cases';
import { ApplicationStatusActions } from './ApplicationStatusActions';

export type ApplicationsTableLabels = {
  company: string;
  service: string;
  status: string;
  owner: string;
  slaDue: string;
  action: string;
  unassigned: string;
  unknownCompany: string;
  slaPrefix: string;
  duePrefix: string;
  slaBreached: string;
  complete: string;
  cancel: string;
  updating: string;
  updated: string;
  noAction: string;
  empty: string;
  emptyHint: string;
  statuses: Record<ServiceCase['status'], string>;
};

function formatTimestamp(value: string | null, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

function isSlaBreached(row: ServiceCase): boolean {
  return Boolean(
    row.slaDueAt &&
    Date.parse(row.slaDueAt) < Date.now() &&
    row.status !== 'completed' &&
    row.status !== 'cancelled',
  );
}

export function ApplicationsTable({
  rows,
  slug,
  labels,
  locale,
}: {
  rows: ServiceCase[];
  slug: string;
  labels: ApplicationsTableLabels;
  locale: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12 text-center">
        <p className="font-medium">{labels.empty}</p>
        <p className="text-muted-foreground mt-1 text-sm">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              {labels.company}
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              {labels.service}
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              {labels.status}
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              {labels.owner}
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              {labels.slaDue}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              {labels.action}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const breached = isSlaBreached(row);
            const update = updateApplicationFormAction.bind(null, slug, row.id);
            return (
              <tr key={row.id} className="hover:bg-muted/30 align-top transition-colors">
                <td className="px-3 py-3 font-medium">
                  {row.companyName || labels.unknownCompany}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{row.title}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{row.serviceType}</div>
                </td>
                <td className="px-3 py-3">
                  <span className="bg-secondary text-secondary-foreground inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
                    {labels.statuses[row.status]}
                  </span>
                </td>
                <td className="px-3 py-3">{row.ownerName ?? labels.unassigned}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {row.slaDueAt ? (
                    <div className={breached ? 'text-destructive font-medium' : undefined}>
                      {labels.slaPrefix}: {formatTimestamp(row.slaDueAt, locale)}
                      {breached ? ` · ${labels.slaBreached}` : null}
                    </div>
                  ) : null}
                  {row.dueAt ? (
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {labels.duePrefix}: {formatTimestamp(row.dueAt, locale)}
                    </div>
                  ) : row.slaDueAt ? null : (
                    <span aria-hidden="true">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {row.status === 'completed' || row.status === 'cancelled' ? (
                    <span className="text-muted-foreground block text-right text-xs">
                      {labels.noAction}
                    </span>
                  ) : (
                    <ApplicationStatusActions
                      action={update}
                      labels={{
                        complete: labels.complete,
                        cancel: labels.cancel,
                        pending: labels.updating,
                        success: labels.updated,
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
