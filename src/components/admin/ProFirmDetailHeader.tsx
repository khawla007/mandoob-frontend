'use client';

import { useState, useTransition } from 'react';
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
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string; code?: string }>) {
    setBusy(label);
    start(async () => {
      const r = await fn();
      if (!r.ok) alert(`${label} failed (${r.code ?? '—'}): ${r.error ?? ''}`);
      setBusy(null);
    });
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <Badge variant={STATUS_VARIANT[tenant.status]}>{tenant.status}</Badge>
          <Badge variant="outline">{tenant.plan}</Badge>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          slug <span className="font-mono">{tenant.slug}</span> · created{' '}
          {new Date(tenant.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tenant.status === 'active' && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (!confirm('Suspend this PRO firm? Members will lose access until reactivated.'))
                return;
              run('Suspend', () => suspendTenantAction(tenant.id));
            }}
          >
            {busy === 'Suspend' ? 'Suspending…' : 'Suspend'}
          </Button>
        )}
        {tenant.status === 'suspended' && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => run('Reactivate', () => reactivateTenantAction(tenant.id))}
          >
            {busy === 'Reactivate' ? 'Reactivating…' : 'Reactivate'}
          </Button>
        )}
        {tenant.status === 'pending' && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run('Approve', () => approveTenantAction(tenant.id))}
            >
              {busy === 'Approve' ? 'Approving…' : 'Approve'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!confirm('Reject this PRO firm? The tenant and admin user will be deleted.'))
                  return;
                run('Reject', () => rejectTenantAction(tenant.id));
              }}
            >
              {busy === 'Reject' ? 'Rejecting…' : 'Reject'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
