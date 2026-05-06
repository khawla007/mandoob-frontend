import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AuditLogRow } from '@/lib/data/audit-log';

function fmtTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function previewDetails(d: unknown): string {
  if (d == null) return '';
  const s = JSON.stringify(d);
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

export function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No audit entries match the current filters.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">When</TableHead>
          <TableHead className="w-28">Kind</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.kind}:${r.id}`}>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {fmtTimestamp(r.createdAt)}
            </TableCell>
            <TableCell>
              <Badge variant={r.kind === 'tenant_audit' ? 'default' : 'secondary'}>
                {r.kind === 'tenant_audit' ? 'tenant' : 'auth'}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">
              {r.tenantName ?? <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell className="text-sm">
              {r.actorName ?? (
                <span className="text-muted-foreground font-mono text-xs">
                  {r.actorId ? r.actorId.slice(0, 8) : '—'}
                </span>
              )}
              {r.actorRole && (
                <Badge variant="outline" className="ml-2">
                  {r.actorRole}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{r.action}</Badge>
            </TableCell>
            <TableCell>
              <details className="max-w-xl">
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  {previewDetails(r.details) || <em>empty</em>}
                </summary>
                <pre className="bg-muted/40 mt-2 max-h-64 overflow-auto rounded p-2 text-xs">
                  {JSON.stringify(
                    {
                      details: r.details,
                      ip: r.ip,
                      userAgent: r.userAgent,
                      source: r.source,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
