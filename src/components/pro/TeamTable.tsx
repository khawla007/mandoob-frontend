import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { TenantMember } from '@/lib/data/tenant-metrics';
import { roleBadgeVariant, statusBadgeVariant } from '@/components/admin/role-badge';
import { formatAdminDateTime } from '@/lib/format/date';

export function TeamTable({
  rows,
  rowActions,
}: {
  rows: TenantMember[];
  rowActions?: (row: TenantMember) => React.ReactNode;
}) {
  const colCount = rowActions ? 6 : 5;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className={rowActions ? '' : 'text-right'}>Last sign-in</TableHead>
          {rowActions && <TableHead className="w-12 text-right" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={colCount}
              className="text-muted-foreground py-10 text-center text-sm"
            >
              No members in this workspace yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">
                    {(r.fullName ?? r.email ?? '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{r.fullName ?? '—'}</div>
                  <div className="text-muted-foreground truncate text-xs">{r.email ?? '—'}</div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              {r.role ? (
                <Badge variant={roleBadgeVariant[r.role]} className="font-mono text-xs">
                  {r.role}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell>
              {r.status ? (
                <Badge variant={statusBadgeVariant[r.status]} className="text-xs capitalize">
                  {r.status}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatAdminDateTime(r.createdAt)}
            </TableCell>
            <TableCell
              className={`text-muted-foreground font-mono text-xs tabular-nums ${rowActions ? '' : 'text-right'}`}
            >
              {formatAdminDateTime(r.lastSignInAt)}
            </TableCell>
            {rowActions && <TableCell className="text-right">{rowActions(r)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
