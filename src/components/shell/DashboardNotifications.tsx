import Link from 'next/link';
import { Bell, BellOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

export type DashboardNotificationState =
  | { status: 'available'; href: string; count: number; label: string }
  | { status: 'empty'; href: string; label: string }
  | { status: 'unavailable'; label: string };

export function DashboardNotifications({ state }: { state: DashboardNotificationState }) {
  if (state.status === 'unavailable') {
    return (
      <div
        role="status"
        aria-label={state.label}
        className="text-muted-foreground flex min-h-9 items-center gap-2 rounded-md border px-2 text-xs"
      >
        <BellOff className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">{state.label}</span>
      </div>
    );
  }

  const accessibleLabel =
    state.status === 'available' ? `${state.label} (${state.count})` : state.label;
  return (
    <Button asChild variant="ghost" size="icon-sm">
      <Link href={state.href} aria-label={accessibleLabel}>
        <Bell className="size-4" aria-hidden="true" />
        {state.status === 'available' ? (
          <span className="bg-destructive text-destructive-foreground absolute -end-1 -top-1 min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4">
            {state.count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
