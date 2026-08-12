import { AlertTriangle, Inbox } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type EmptyAction = { label: string; href: string };

type WidgetNonDataState =
  | { kind: 'loading' }
  | { kind: 'empty'; message: string; emptyAction: EmptyAction }
  | { kind: 'error'; message: string; retryHref?: string };

export type WidgetStateProps<DataProps> = ({ kind?: 'data' } & DataProps) | WidgetNonDataState;

export function WidgetMessage({
  status,
  className,
}: {
  status: Exclude<WidgetNonDataState, { kind: 'loading' }>;
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
      <p className="text-muted-foreground text-sm">{status.message}</p>
      {status.kind === 'empty' ? (
        <Link
          href={status.emptyAction.href}
          className="text-foreground focus-visible:ring-ring rounded-sm text-sm font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          {status.emptyAction.label}
        </Link>
      ) : status.retryHref ? (
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

export function WidgetLoading({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <div
      aria-label="Loading"
      aria-busy="true"
      data-testid={testId}
      className={cn('animate-pulse motion-reduce:animate-none', className)}
    >
      {children}
    </div>
  );
}
