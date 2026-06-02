'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('admin');
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function unlock(key: string) {
    if (!confirm(t('user.lockedAccounts.confirmUnlock', { key }))) return;
    setBusy(key);
    start(async () => {
      const r = await unlockAccountAction({ key });
      if (!r.ok) alert(t('user.lockedAccounts.unlockFailed', { code: r.code, error: r.error }));
      setBusy(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {t('user.lockedAccounts.empty')}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('user.lockedAccounts.account')}</TableHead>
          <TableHead>{t('user.lockedAccounts.failures')}</TableHead>
          <TableHead>{t('user.lockedAccounts.lockedUntil')}</TableHead>
          <TableHead>{t('user.lockedAccounts.lastAttempt')}</TableHead>
          <TableHead className="text-right">{t('user.lockedAccounts.actions')}</TableHead>
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
                  {isBusy ? t('user.lockedAccounts.unlocking') : t('user.lockedAccounts.unlock')}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
