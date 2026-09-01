'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type SharedStateProps = {
  variant?: 'page' | 'panel';
  className?: string;
};

type DashboardRouteStateProps =
  | (SharedStateProps & { state: 'loading'; label: string })
  | (SharedStateProps & {
      state: 'empty';
      title: string;
      description: string;
      action?: React.ReactNode;
    })
  | (SharedStateProps & {
      state: 'error';
      title: string;
      safeDescription: string;
      onRetry?: () => void;
      retryLabel?: string;
      safeHref?: string;
      safeHrefLabel?: string;
    })
  | (SharedStateProps & {
      state: 'permission';
      title: string;
      description: string;
      action?: React.ReactNode;
    })
  | (SharedStateProps & {
      state: 'unavailable';
      title: string;
      description: string;
      action?: React.ReactNode;
    });

export function DashboardRouteState(props: DashboardRouteStateProps) {
  const { state, variant = 'page', className } = props;
  const frameClassName = cn(
    'border-border bg-card text-card-foreground rounded-xl border',
    variant === 'page' ? 'min-h-64 p-6 sm:p-8' : 'p-5',
    className,
  );

  if (state === 'loading') {
    return (
      <section
        className={cn(frameClassName, 'space-y-6')}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={props.label}
      >
        <div aria-hidden="true" className="space-y-3">
          <Skeleton className="h-7 w-52 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <div className="grid gap-4 pt-3 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const description = state === 'error' ? props.safeDescription : props.description;
  const action = state === 'error' ? null : props.action;

  return (
    <section className={frameClassName} aria-labelledby={`dashboard-${state}-title`}>
      <div className="max-w-xl space-y-3">
        <h2 id={`dashboard-${state}-title`} className="text-xl font-semibold tracking-tight">
          {props.title}
        </h2>
        <p className="text-muted-foreground text-sm leading-6">{description}</p>
        {state === 'error' && (props.onRetry || props.safeHref) ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {props.onRetry && props.retryLabel ? (
              <Button type="button" onClick={props.onRetry}>
                {props.retryLabel}
              </Button>
            ) : null}
            {props.safeHref && props.safeHrefLabel ? (
              <Button asChild variant="outline">
                <Link href={props.safeHref}>{props.safeHrefLabel}</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          action
        )}
      </div>
    </section>
  );
}
