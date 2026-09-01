import type { ReactNode } from 'react';
import { CircleAlert, DatabaseZap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card data-dashboard-panel className={`signal-panel min-w-0 overflow-hidden ${className}`}>
      <CardHeader className="relative flex-row items-start justify-between gap-4 space-y-0 border-b pb-3">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <CardDescription className="mt-1 text-xs leading-5">{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent className="relative pt-4">{children}</CardContent>
    </Card>
  );
}

export function UnavailablePanel({ t }: { t: Translate }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-4 text-center">
      <span className="bg-muted text-muted-foreground mb-3 flex size-10 items-center justify-center rounded-full">
        <DatabaseZap aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium">{t('dashboard.command.unavailable.title')}</p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs leading-5">
        {t('dashboard.command.unavailable.phase3')}
      </p>
    </div>
  );
}

export function ErrorPanel({ t }: { t: Translate }) {
  return (
    <div
      className="flex min-h-44 flex-col items-center justify-center px-4 text-center"
      role="alert"
    >
      <CircleAlert aria-hidden className="text-destructive mb-3 size-5" />
      <p className="text-sm font-medium">{t('dashboard.command.error.title')}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {t('dashboard.command.error.description')}
      </p>
    </div>
  );
}
