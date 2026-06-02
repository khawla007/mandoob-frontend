'use client';

import Link from 'next/link';
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
  suspendTenantAction,
  reactivateTenantAction,
  approveTenantAction,
  rejectTenantAction,
} from '@/app/admin/pro-firms/actions';
import type { ProFirmRow } from '@/lib/data/pro-firms';

const STATUS_VARIANT: Record<ProFirmRow['status'], 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  pending: 'secondary',
  suspended: 'destructive',
};

export function ProFirmsTable({ rows }: { rows: ProFirmRow[] }) {
  const t = useTranslations('admin');
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function onSuspend(id: string) {
    if (!confirm(t('proFirms.actions.confirmSuspend'))) return;
    setBusyId(id);
    startTransition(async () => {
      const r = await suspendTenantAction(id);
      if (!r.ok) alert(t('proFirms.actions.suspendFailed', { error: r.error ?? '' }));
      setBusyId(null);
    });
  }

  function onReactivate(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const r = await reactivateTenantAction(id);
      if (!r.ok) alert(t('proFirms.actions.reactivateFailed', { error: r.error ?? '' }));
      setBusyId(null);
    });
  }

  function onApprove(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const r = await approveTenantAction(id);
      if (!r.ok) alert(t('proFirms.actions.approveFailed', { error: r.error ?? '' }));
      setBusyId(null);
    });
  }

  function onReject(id: string) {
    if (!confirm(t('proFirms.actions.confirmReject'))) return;
    setBusyId(id);
    startTransition(async () => {
      const r = await rejectTenantAction(id);
      if (!r.ok) alert(t('proFirms.actions.rejectFailed', { error: r.error ?? '' }));
      setBusyId(null);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('proFirms.table.name')}</TableHead>
          <TableHead>{t('proFirms.table.slug')}</TableHead>
          <TableHead>{t('proFirms.table.plan')}</TableHead>
          <TableHead>{t('proFirms.table.status')}</TableHead>
          <TableHead>{t('proFirms.table.created')}</TableHead>
          <TableHead className="text-right">{t('proFirms.table.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">
              <Link
                href={`/admin/pro-firms/${r.id}`}
                className="underline-offset-4 hover:underline"
              >
                {r.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">{r.slug}</TableCell>
            <TableCell>
              <Badge variant="outline">{r.plan}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status]}>
                {t(`enums.tenantStatus.${r.status}`)}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {new Date(r.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              {r.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending && busyId === r.id}
                  onClick={() => onSuspend(r.id)}
                >
                  {t('proFirms.table.suspend')}
                </Button>
              )}
              {r.status === 'suspended' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending && busyId === r.id}
                  onClick={() => onReactivate(r.id)}
                >
                  {t('proFirms.table.reactivate')}
                </Button>
              )}
              {r.status === 'pending' && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={pending && busyId === r.id}
                    onClick={() => onApprove(r.id)}
                  >
                    {t('proFirms.table.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending && busyId === r.id}
                    onClick={() => onReject(r.id)}
                  >
                    {t('proFirms.table.reject')}
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
