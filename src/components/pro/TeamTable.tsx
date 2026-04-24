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
import type { Role } from '@/lib/data/users';

const roleVariant: Record<Role, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  pro: 'secondary',
  customer: 'outline',
  employee: 'outline',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TeamTable({ rows }: { rows: TenantMember[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Last sign-in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
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
                <Badge variant={roleVariant[r.role]} className="font-mono text-xs">
                  {r.role}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell>
              {r.status ? (
                <Badge
                  variant={
                    r.status === 'active'
                      ? 'outline'
                      : r.status === 'invited'
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="text-xs capitalize"
                >
                  {r.status}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
              {formatDate(r.createdAt)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
              {formatDate(r.lastSignInAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
