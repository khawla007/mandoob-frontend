import { AlertTriangle, Inbox } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type WidgetStatus =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'empty'; message?: string }
  | { kind: 'error'; message?: string; retryHref?: string };

export const READY_WIDGET_STATUS: WidgetStatus = { kind: 'ready' };

export function WidgetMessage({
  status,
  className,
}: {
  status: Exclude<WidgetStatus, { kind: 'ready' } | { kind: 'loading' }>;
  className?: string;
}) {
  const isError = status.kind === 'error';
  const Icon = isError ? AlertTriangle : Inbox;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'border-border/70 bg-muted/35 flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="text-muted-foreground size-5" />
      <p className="text-muted-foreground text-sm">
        {status.message ??
          (isError ? 'This signal is temporarily unavailable.' : 'No signals yet.')}
      </p>
      {isError && status.retryHref ? (
        <Link
          href={status.retryHref}
          className="text-foreground focus-visible:ring-ring rounded-sm text-sm font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Retry
        </Link>
      ) : null}
    </div>
  );
}

export function WidgetSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-label="Loading" aria-busy="true" className={cn('space-y-3', className)}>
      <Skeleton className="h-5 w-36" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn('h-12 w-full', index === rows - 1 && 'w-4/5')} />
      ))}
    </div>
  );
}
