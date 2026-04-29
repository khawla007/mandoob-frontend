import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { formatAdminDateTime } from '@/lib/format/date';
import { roleBadgeVariant, statusBadgeVariant } from './role-badge';
import type { UserRow, SortCol, SortDir } from '@/lib/data/users';

function SortHeader({
  col,
  label,
  align,
  active,
}: {
  col: SortCol;
  label: string;
  align?: 'right';
  active: { col: SortCol; dir: SortDir };
}) {
  const isActive = active.col === col;
  const nextDir: SortDir = isActive && active.dir === 'desc' ? 'asc' : 'desc';
  const Icon = !isActive ? ChevronsUpDown : active.dir === 'desc' ? ChevronDown : ChevronUp;
  return (
    <Link
      href={`?sort=${col}:${nextDir}`}
      scroll={false}
      className={cn(
        'hover:text-foreground inline-flex items-center gap-1',
        align === 'right' && 'justify-end',
        isActive ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      <Icon className="size-3" />
    </Link>
  );
}

export function UsersTable({
  rows,
  sort,
}: {
  rows: UserRow[];
  sort: { col: SortCol; dir: SortDir };
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <SortHeader col="full_name" label="User" active={sort} />
          </TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <SortHeader col="created_at" label="Created" active={sort} />
          </TableHead>
          <TableHead className="text-right">Last sign-in</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className={cn(r.status === 'disabled' && 'opacity-50')}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Avatar className="size-8">
                  {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
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
            <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
              {formatAdminDateTime(r.lastSignInAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
