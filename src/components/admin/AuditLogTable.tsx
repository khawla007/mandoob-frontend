import { getTranslations } from 'next-intl/server';
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

export async function AuditLogTable({ rows }: { rows: AuditLogRow[] }) {
  const t = await getTranslations('admin');
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{t('audit.table.empty')}</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">{t('audit.table.when')}</TableHead>
          <TableHead className="w-28">{t('audit.table.kind')}</TableHead>
          <TableHead>{t('audit.table.tenant')}</TableHead>
          <TableHead>{t('audit.table.actor')}</TableHead>
          <TableHead>{t('audit.table.action')}</TableHead>
          <TableHead>{t('audit.table.details')}</TableHead>
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
                {t(`audit.kindBadge.${r.kind}`)}
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
                  {t.has(`enums.role.${r.actorRole}`)
                    ? t(`enums.role.${r.actorRole}`)
                    : r.actorRole}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{r.action}</Badge>
            </TableCell>
            <TableCell>
              <details className="max-w-xl">
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  {previewDetails(r.details) || <em>{t('audit.table.emptyDetails')}</em>}
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
