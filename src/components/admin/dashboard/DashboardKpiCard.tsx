import type { LucideIcon } from 'lucide-react';
import { CircleAlert, DatabaseZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KpiDefinition, KpiDatum, WidgetState } from '@/lib/admin-dashboard/contracts';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

export function DashboardKpiCard({
  definition,
  state,
  icon: Icon,
  locale,
  t,
}: {
  definition: KpiDefinition;
  state: WidgetState<KpiDatum>;
  icon: LucideIcon;
  locale: string;
  t: Translate;
}) {
  const label = t(`dashboard.command.kpis.${definition.id}.label`);
  return (
    <article
      data-kpi={definition.id}
      className={cn(
        'signal-kpi relative min-h-32 min-w-0 overflow-hidden rounded-xl border p-4',
        `signal-kpi--${definition.tone}`,
      )}
      aria-label={label}
    >
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-muted-foreground text-[0.72rem] leading-4 font-semibold">{label}</h2>
          {state.state === 'data' || state.state === 'empty' ? (
            <p className="mt-2 font-mono text-2xl leading-none font-semibold tabular-nums">
              {new Intl.NumberFormat(locale).format(state.data.value)}
            </p>
          ) : (
            <p className="mt-2 text-sm leading-5 font-semibold">
              {state.state === 'unavailable'
                ? t('dashboard.command.unavailable.title')
                : t('dashboard.command.error.short')}
            </p>
          )}
        </div>
        <span className="bg-background/70 flex size-9 shrink-0 items-center justify-center rounded-lg border">
          {state.state === 'unavailable' ? (
            <DatabaseZap aria-hidden className="size-4" />
          ) : state.state === 'error' ? (
            <CircleAlert aria-hidden className="text-destructive size-4" />
          ) : (
            <Icon aria-hidden className="size-4" />
          )}
        </span>
      </div>
      <p className="text-muted-foreground relative z-10 mt-3 text-[0.68rem] leading-4">
        {state.state === 'unavailable'
          ? t('dashboard.command.unavailable.phase3')
          : state.state === 'error'
            ? t('dashboard.command.error.description')
            : t(`dashboard.command.kpis.${definition.id}.helper`)}
      </p>
    </article>
  );
}
