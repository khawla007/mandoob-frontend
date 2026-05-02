import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProClientRow } from '@/lib/data/clients-list';
import type { ClientStatus } from '@/lib/validation/client';

const STATUS_VARIANT: Record<ClientStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  onboarding: 'secondary',
  active: 'default',
  renewal_due: 'outline',
  renewal_overdue: 'destructive',
  suspended: 'destructive',
  churned: 'outline',
};

const STATUS_LABEL: Record<ClientStatus, string> = {
  onboarding: 'Onboarding',
  active: 'Active',
  renewal_due: 'Renewal due',
  renewal_overdue: 'Overdue',
  suspended: 'Suspended',
  churned: 'Churned',
};

export function ClientsTable({ slug, rows }: { slug: string; rows: ProClientRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Jurisdiction</TableHead>
          <TableHead>License expiry</TableHead>
          <TableHead>Last activity</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">
              <Link
                href={`/t/${slug}/clients/${r.id}`}
                className="underline-offset-4 hover:underline"
              >
                {r.company_name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">{r.jurisdiction ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {r.license_expiry ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(r.updated_at).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
