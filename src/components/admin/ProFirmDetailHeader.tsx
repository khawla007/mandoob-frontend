'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  approveTenantAction,
  reactivateTenantAction,
  rejectTenantAction,
  suspendTenantAction,
} from '@/app/admin/pro-firms/actions';
import type { ProFirmRow } from '@/lib/data/pro-firms';

const STATUS_VARIANT: Record<ProFirmRow['status'], 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  pending: 'secondary',
  suspended: 'destructive',
};

export function ProFirmDetailHeader({ tenant }: { tenant: ProFirmRow }) {
  const t = useTranslations('admin');
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(
    action: string,
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string; code?: string }>,
  ) {
    setBusy(action);
    start(async () => {
      const r = await fn();
      if (!r.ok)
        alert(
          t('proFirms.actions.actionFailed', {
            action: label,
            code: r.code ?? '—',
            error: r.error ?? '',
          }),
        );
      setBusy(null);
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <Badge variant={STATUS_VARIANT[tenant.status]}>
            {t(`enums.tenantStatus.${tenant.status}`)}
          </Badge>
          <Badge variant="outline">{tenant.plan}</Badge>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {t('proFirms.detail.slug')} <span className="font-mono">{tenant.slug}</span> ·{' '}
          {t('proFirms.detail.created')} {new Date(tenant.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tenant.status === 'active' && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(t('proFirms.actions.confirmSuspend'))) return;
              run('suspend', t('proFirms.detail.suspend'), () => suspendTenantAction(tenant.id));
            }}
          >
            {busy === 'suspend' ? t('proFirms.detail.suspending') : t('proFirms.detail.suspend')}
          </Button>
        )}
        {tenant.status === 'suspended' && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run('reactivate', t('proFirms.detail.reactivate'), () =>
                reactivateTenantAction(tenant.id),
              )
            }
          >
            {busy === 'reactivate'
              ? t('proFirms.detail.reactivating')
              : t('proFirms.detail.reactivate')}
          </Button>
        )}
        {tenant.status === 'pending' && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run('approve', t('proFirms.detail.approve'), () => approveTenantAction(tenant.id))
              }
            >
              {busy === 'approve' ? t('proFirms.detail.approving') : t('proFirms.detail.approve')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(t('proFirms.actions.confirmReject'))) return;
                run('reject', t('proFirms.detail.reject'), () => rejectTenantAction(tenant.id));
              }}
            >
              {busy === 'reject' ? t('proFirms.detail.rejecting') : t('proFirms.detail.reject')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
