import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { RecentLoginRow } from '@/lib/data/admin-metrics';
import { roleBadgeVariant } from './role-badge';

export function RecentLoginsTable({
  rows,
  title = 'Recent logins',
  description = 'Latest authentication events across all tenants.',
}: {
  rows: RecentLoginRow[];
  title?: string;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                  No login events yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">
                        {r.email.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{r.email}</span>
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
                <TableCell className="font-mono text-xs tabular-nums">{r.ip}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums">{r.time}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={r.status === 'success' ? 'outline' : 'destructive'}>
                    {r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
