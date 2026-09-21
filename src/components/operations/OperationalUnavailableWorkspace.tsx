import Link from 'next/link';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';
import { Card, CardContent } from '@/components/ui/card';

export type OperationalUnavailableWorkspaceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  sourceLabel: string;
  sourceValue: string;
  scopeLabel: string;
  scopeValue: string;
  ownerLabel: string;
  ownerValue: string;
  unavailableTitle: string;
  unavailableDescription: string;
  listTitle: string;
  listDescription: string;
  boundaries: readonly string[];
  filtersLabel: string;
  resetLabel: string;
};

export function OperationalUnavailableWorkspace({
  copy,
  filters,
  resetHref,
}: {
  copy: OperationalUnavailableWorkspaceCopy;
  filters: readonly { label: string; value: string }[];
  resetHref: string;
}) {
  return (
    <div className="signal-dashboard min-w-0 space-y-6">
      <DashboardPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      <section className="grid min-w-0 gap-3 md:grid-cols-3" aria-label={copy.sourceLabel}>
        {[
          [copy.sourceLabel, copy.sourceValue],
          [copy.scopeLabel, copy.scopeValue],
          [copy.ownerLabel, copy.ownerValue],
        ].map(([label, value]) => (
          <Card key={label} className="signal-panel min-w-0">
            <CardContent className="p-4">
              <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">
                {label}
              </p>
              <p className="mt-2 text-sm font-medium break-words">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {filters.length ? (
        <section className="signal-panel rounded-xl border p-4" aria-label={copy.filtersLabel}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground font-medium">{copy.filtersLabel}</span>
            {filters.map((filter) => (
              <span key={filter.label} className="bg-muted rounded-md px-2.5 py-1">
                {filter.label}: {filter.value}
              </span>
            ))}
            <Link className="ms-auto underline underline-offset-4" href={resetHref}>
              {copy.resetLabel}
            </Link>
          </div>
        </section>
      ) : null}

      <DashboardRouteState
        state="unavailable"
        variant="panel"
        title={copy.unavailableTitle}
        description={copy.unavailableDescription}
      />

      <section
        data-operational-list-alternative
        className="signal-panel rounded-xl border p-5"
        aria-labelledby="operational-boundaries-title"
      >
        <h2 id="operational-boundaries-title" className="text-lg font-semibold tracking-tight">
          {copy.listTitle}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">{copy.listDescription}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {copy.boundaries.map((boundary) => (
            <li key={boundary} className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
              {boundary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
