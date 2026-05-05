'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  revokeSessionAction,
  revokeAllSessionsForUserAction,
} from '@/app/admin/observability/actions';
import type { SessionOverviewRow } from '@/lib/data/sessions-overview';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export function SessionsTable({
  rows,
  viewerUserId,
}: {
  rows: SessionOverviewRow[];
  viewerUserId: string;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function revokeOne(row: SessionOverviewRow) {
    if (!confirm(`Revoke this session for ${row.fullName ?? row.userId}?`)) return;
    setBusy(row.sessionId);
    start(async () => {
      const r = await revokeSessionAction({ sessionId: row.sessionId, userId: row.userId });
      if (!r.ok) alert(`Revoke failed (${r.code}): ${r.error}`);
      setBusy(null);
    });
  }

  function revokeAll(row: SessionOverviewRow) {
    if (
      !confirm(
        `Revoke ALL sessions for ${row.fullName ?? row.userId}? They will be signed out everywhere.`,
      )
    )
      return;
    setBusy(`all:${row.userId}`);
    start(async () => {
      const r = await revokeAllSessionsForUserAction({ userId: row.userId });
      if (!r.ok) alert(`Revoke-all failed (${r.code}): ${r.error}`);
      setBusy(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No active sessions match the current filters.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Tenant</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Last seen</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const isSelf = r.userId === viewerUserId;
          const oneBusy = pending && busy === r.sessionId;
          const allBusy = pending && busy === `all:${r.userId}`;
          return (
            <TableRow key={r.sessionId}>
              <TableCell>
                <div className="text-sm">{r.fullName ?? <em>—</em>}</div>
                <div className="text-muted-foreground font-mono text-xs">
                  {r.userId.slice(0, 8)}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {r.tenantName ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                {r.role ? (
                  <Badge variant="outline">{r.role}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.ip ?? '—'}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.createdAt)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.refreshedAt)}</TableCell>
              <TableCell className="space-x-2 text-right">
                {isSelf ? (
                  <Badge variant="secondary">you</Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => revokeOne(r)}
                    >
                      {oneBusy ? 'Revoking…' : 'Revoke'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => revokeAll(r)}
                    >
                      {allBusy ? 'Revoking all…' : 'Revoke all'}
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
