'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { revokeMySessionAction, signOutEverywhereAction } from '@/app/account/actions';
import type { SessionSummary } from '@/lib/auth/sessions';

export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const [isPending, startTransition] = useTransition();

  const revoke = (id: string) => {
    startTransition(async () => {
      const res = await revokeMySessionAction(id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Session revoked');
      window.location.reload();
    });
  };

  const signOutEverywhere = () => {
    if (!sessions.length) return;
    if (!confirm('Sign out of every session, including this one? You will need to log in again.'))
      return;
    startTransition(async () => {
      const res = await signOutEverywhereAction();
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success('Signed out everywhere');
      window.location.href = '/login';
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{sessions.length} active session(s)</p>
        <Button
          type="button"
          variant="outline"
          onClick={signOutEverywhere}
          disabled={isPending || sessions.length === 0}
        >
          Sign out everywhere
        </Button>
      </div>
      <ul className="divide-y rounded border">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-4 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{s.userAgent ?? 'Unknown device'}</p>
              <p className="text-muted-foreground">
                {s.ip ?? '—'} · last seen {s.lastSeenAt}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => revoke(s.id)}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
