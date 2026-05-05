import { RenewalRowActions } from '@/components/pro/RenewalRowActions';
import {
  RenewalSourceBadge,
  RenewalStatusBadge,
  RenewalTypeBadge,
} from '@/components/pro/RenewalBadges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { bucketRenewals } from '@/lib/data/renewal-buckets';
import type { RenewalRow } from '@/lib/data/renewals';

export type ClientLite = { id: string; company_name: string };

export type RenewalsTableProps = {
  rows: RenewalRow[];
  clients: Map<string, ClientLite>;
  showClientColumn: boolean;
  slug: string;
  mode: 'bucketed' | 'flat';
  emptyMessage?: string;
};

function formatDays(daysOut: number, status: RenewalRow['status']): string {
  if (status === 'completed' || status === 'cancelled') return '—';
  if (daysOut < 0) return `${Math.abs(daysOut)}d overdue`;
  if (daysOut === 0) return 'Due today';
  if (daysOut === 1) return '1 day';
  return `${daysOut} days`;
}

export function RenewalsTable(props: RenewalsTableProps) {
  if (props.rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">
          {props.emptyMessage ?? 'No renewals to show.'}
        </p>
      </div>
    );
  }

  if (props.mode === 'flat') {
    return <FlatTable {...props} />;
  }

  const buckets = bucketRenewals(props.rows);
  const sections: { key: string; title: string; rows: RenewalRow[] }[] = [
    { key: 'd30', title: 'Due in 30 days', rows: buckets.d30 },
    { key: 'd60', title: '31–60 days', rows: buckets.d60 },
    { key: 'd90', title: '61–90 days', rows: buckets.d90 },
    { key: 'later', title: 'Later (90d+)', rows: buckets.later },
  ];

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.key} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            <span className="text-muted-foreground text-xs">{s.rows.length}</span>
          </div>
          {s.rows.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-xs">
              No renewals in this bucket.
            </p>
          ) : (
            <FlatTable {...props} rows={s.rows} />
          )}
        </section>
      ))}
    </div>
  );
}

function FlatTable(props: RenewalsTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {props.showClientColumn && <TableHead>Client</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((r) => {
            const client = props.clients.get(r.clientId);
            return (
              <TableRow key={r.id}>
                {props.showClientColumn && (
                  <TableCell className="font-medium">{client?.company_name ?? '—'}</TableCell>
                )}
                <TableCell>
                  <RenewalTypeBadge type={r.type} />
                </TableCell>
                <TableCell className="max-w-[24rem] truncate">{r.label}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <div className="text-sm">{r.dueDate}</div>
                  <div className="text-muted-foreground text-xs">
                    {formatDays(r.daysOut, r.status)}
                  </div>
                </TableCell>
                <TableCell>
                  <RenewalStatusBadge status={r.status} />
                </TableCell>
                <TableCell>
                  <RenewalSourceBadge source={r.source} />
                </TableCell>
                <TableCell className="text-right">
                  <RenewalRowActions row={r} slug={props.slug} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
