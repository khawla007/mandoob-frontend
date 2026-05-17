'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { revokeMySessionAction, signOutEverywhereAction } from '@/app/account/actions';
import type { SessionSummary } from '@/lib/auth/sessions';

export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const t = useTranslations('account');
  const [isPending, startTransition] = useTransition();

  const revoke = (id: string) => {
    startTransition(async () => {
      const res = await revokeMySessionAction(id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t('sessionRevoked'));
      window.location.reload();
    });
  };

  const signOutEverywhere = () => {
    if (!sessions.length) return;
    if (!confirm(t('longCopy.signOutEverywhereConfirm'))) return;
    startTransition(async () => {
      const res = await signOutEverywhereAction();
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t('signedOutEverywhere'));
      window.location.href = '/login';
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t('activeSessionsCount', { count: sessions.length })}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={signOutEverywhere}
          disabled={isPending || sessions.length === 0}
        >
          {t('signOutEverywhere')}
        </Button>
      </div>
      <ul className="divide-y rounded border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-4 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{s.userAgent ?? t('unknownDevice')}</p>
              <p className="text-muted-foreground">
                {s.ip ?? '—'} · {t('lastSeen')} {s.lastSeenAt}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => revoke(s.id)}
            >
              {t('revoke')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
