import type { RenewalRow, RenewalStatus, RenewalType } from '@/lib/data/renewals';

export function RenewalsTimeline({
  rows,
  locale,
  labels,
}: {
  rows: RenewalRow[];
  locale: string;
  labels: {
    title: string;
    due: string;
    types: Record<RenewalType, string>;
    statuses: Record<RenewalStatus, string>;
  };
}) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Dubai' });
  return (
    <section
      aria-labelledby="renewal-timeline-title"
      className="signal-panel min-w-0 rounded-lg border p-4"
    >
      <h2 id="renewal-timeline-title" className="text-base font-semibold">
        {labels.title}
      </h2>
      <ol className="mt-4 space-y-4 border-s ps-4">
        {rows.map((row) => (
          <li key={row.id} className="relative">
            <span
              aria-hidden="true"
              className="bg-primary absolute -start-[1.35rem] top-1 size-2.5 rounded-full"
            />
            <p className="font-medium">{row.label}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {labels.types[row.type]} · {labels.statuses[row.status]} · {labels.due}{' '}
              {date.format(new Date(`${row.dueDate}T00:00:00Z`))}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
