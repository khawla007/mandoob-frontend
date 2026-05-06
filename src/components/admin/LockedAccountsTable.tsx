'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { unlockAccountAction } from '@/app/admin/observability/actions';
import type { LockedAccountRow } from '@/lib/data/security-dashboard';
import { parseLockoutKey } from '@/lib/data/security-helpers';

function fmt(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export function LockedAccountsTable({ rows }: { rows: LockedAccountRow[] }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function unlock(key: string) {
    if (!confirm(`Unlock ${key}? This clears the failure counter and lockout window.`)) return;
    setBusy(key);
    start(async () => {
      const r = await unlockAccountAction({ key });
      if (!r.ok) alert(`Unlock failed (${r.code}): ${r.error}`);
      setBusy(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No accounts are currently locked.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead>Failures</TableHead>
          <TableHead>Locked until</TableHead>
          <TableHead>Last attempt</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const parsed = parseLockoutKey(r.key);
          const isBusy = pending && busy === r.key;
          return (
            <TableRow key={r.key}>
              <TableCell className="font-mono text-xs">
                {parsed?.kind === 'acct' ? parsed.value : r.key}
              </TableCell>
              <TableCell>{r.count}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.lockedUntil)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmt(r.updatedAt)}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => unlock(r.key)}
                >
                  {isBusy ? 'Unlocking…' : 'Unlock'}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
