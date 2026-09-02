import { Badge } from '@/components/ui/badge';
import type { RenewalStatus, RenewalType } from '@/lib/data/renewals';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';

export type RenewalsTableLabels = {
  queue: string;
  type: string;
  label: string;
  due: string;
  status: string;
  source: string;
  actionsUnavailable: string;
  today: string;
  overdue: string;
  days: string;
  missingDate: string;
  typeValues: Record<RenewalType, string>;
  statusValues: Record<RenewalStatus, string>;
  sourceValues: Record<RenewalWorkspaceRow['source'], string>;
};

function dueText(row: RenewalWorkspaceRow, labels: RenewalsTableLabels): string | null {
  if (row.status === 'completed' || row.status === 'cancelled') return null;
  if (row.daysOut === null) return null;
  if (row.daysOut < 0) return `${Math.abs(row.daysOut)} ${labels.days} ${labels.overdue}`;
  if (row.daysOut === 0) return labels.today;
  return `${row.daysOut} ${labels.days}`;
}

export function RenewalsTable({
  rows,
  labels,
  locale,
}: {
  rows: RenewalWorkspaceRow[];
  labels: RenewalsTableLabels;
  locale: string;
}) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  return (
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label={labels.queue}>
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">
              {labels.type}
            </th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">
              {labels.label}
            </th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">
              {labels.due}
            </th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">
              {labels.status}
            </th>
            <th scope="col" className="px-3 py-2.5 text-start font-medium">
              {labels.source}
            </th>
            <th scope="col" className="px-3 py-2.5 text-end font-medium">
              {labels.actionsUnavailable}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30 align-top transition-colors">
              <td className="px-3 py-3">
                <Badge variant="outline">{labels.typeValues[row.type]}</Badge>
              </td>
              <td className="max-w-[28rem] px-3 py-3 font-medium break-words">{row.label}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                <div>
                  {row.dueDate
                    ? date.format(new Date(`${row.dueDate}T00:00:00Z`))
                    : labels.missingDate}
                </div>
                {dueText(row, labels) ? (
                  <div className="text-muted-foreground mt-0.5 text-xs">{dueText(row, labels)}</div>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <Badge variant="secondary">{labels.statusValues[row.status]}</Badge>
              </td>
              <td className="px-3 py-3">
                <span className="text-muted-foreground text-xs">
                  {labels.sourceValues[row.source]}
                </span>
              </td>
              <td className="text-muted-foreground px-3 py-3 text-end text-xs">
                {labels.actionsUnavailable}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
