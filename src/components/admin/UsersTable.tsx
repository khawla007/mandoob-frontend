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
import type { UserRow, Role, ProfileStatus } from '@/lib/data/users';

const roleVariant: Record<Role, 'default' | 'secondary' | 'outline'> = {
  super_admin: 'default',
  pro: 'secondary',
  customer: 'outline',
  employee: 'outline',
};

const statusVariant: Record<ProfileStatus, 'outline' | 'secondary' | 'destructive'> = {
  active: 'outline',
  invited: 'secondary',
  disabled: 'destructive',
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

export function UsersTable({ rows }: { rows: UserRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Last sign-in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
              No users match this filter.
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
            <TableCell className="text-sm">
              {r.tenantSlug ? (
                <span>
                  <span className="font-medium">{r.tenantName}</span>
                  <span className="text-muted-foreground font-mono text-xs"> /{r.tenantSlug}</span>
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell>
              {r.status ? (
                <Badge variant={statusVariant[r.status]} className="text-xs capitalize">
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
