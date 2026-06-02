'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('admin');
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function revokeOne(row: SessionOverviewRow) {
    if (!confirm(t('user.sessions.confirmRevokeOne', { name: row.fullName ?? row.userId }))) return;
    setBusy(row.sessionId);
    start(async () => {
      const r = await revokeSessionAction({ sessionId: row.sessionId, userId: row.userId });
      if (!r.ok) alert(t('user.sessions.revokeFailed', { code: r.code, error: r.error }));
      setBusy(null);
    });
  }

  function revokeAll(row: SessionOverviewRow) {
    if (!confirm(t('user.sessions.confirmRevokeAll', { name: row.fullName ?? row.userId }))) return;
    setBusy(`all:${row.userId}`);
    start(async () => {
      const r = await revokeAllSessionsForUserAction({ userId: row.userId });
      if (!r.ok) alert(t('user.sessions.revokeAllFailed', { code: r.code, error: r.error }));
      setBusy(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{t('user.sessions.empty')}</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('user.sessions.user')}</TableHead>
          <TableHead>{t('user.sessions.tenant')}</TableHead>
          <TableHead>{t('user.sessions.role')}</TableHead>
          <TableHead>{t('user.sessions.ip')}</TableHead>
          <TableHead>{t('user.sessions.started')}</TableHead>
          <TableHead>{t('user.sessions.lastSeen')}</TableHead>
          <TableHead className="text-right">{t('user.sessions.actions')}</TableHead>
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
                  <Badge variant="outline">{t(`enums.role.${r.role}`)}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{r.ip ?? '—'}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.createdAt)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.refreshedAt)}</TableCell>
              <TableCell className="space-x-2 text-right">
                {isSelf ? (
                  <Badge variant="secondary">{t('user.sessions.you')}</Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => revokeOne(r)}
                    >
                      {oneBusy ? t('user.sessions.revoking') : t('user.sessions.revoke')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() => revokeAll(r)}
                    >
                      {allBusy ? t('user.sessions.revokingAll') : t('user.sessions.revokeAll')}
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
