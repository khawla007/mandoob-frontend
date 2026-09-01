import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type DashboardPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  filters?: ReactNode;
  secondaryAction?: ReactNode;
  primaryAction?: ReactNode;
  className?: string;
};

export function DashboardPageHeader({
  eyebrow,
  title,
  description,
  filters,
  secondaryAction,
  primaryAction,
  className,
}: DashboardPageHeaderProps) {
  const hasControls = filters || secondaryAction || primaryAction;

  return (
    <header
      className={cn('mb-6 flex min-w-0 flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="max-w-3xl min-w-0">
        {eyebrow ? (
          <p className="text-primary font-mono text-xs font-semibold tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight" title={title}>
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">{description}</p>
        ) : null}
      </div>
      {hasControls ? (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {filters}
          {secondaryAction}
          {primaryAction}
        </div>
      ) : null}
    </header>
  );
}
