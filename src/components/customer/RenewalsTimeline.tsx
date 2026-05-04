import type { PastRenewal, Renewal } from '@/lib/mocks/customer-portal';

const TYPE_LABEL: Record<Renewal['type'], string> = {
  license: 'License',
  visa: 'Visa',
  eid: 'Emirates ID',
  ejari: 'Ejari',
};

function urgencyColor(daysOut: number): string {
  if (daysOut <= 30) return 'bg-destructive border-destructive';
  if (daysOut <= 90) return 'bg-amber-500 border-amber-500';
  return 'bg-primary border-primary';
}

type Item = { kind: 'upcoming'; row: Renewal } | { kind: 'past'; row: PastRenewal };

export function RenewalsTimeline({ upcoming, past }: { upcoming: Renewal[]; past: PastRenewal[] }) {
  const items: Item[] = [
    ...upcoming.map((r) => ({ kind: 'upcoming' as const, row: r })),
    ...past.map((r) => ({ kind: 'past' as const, row: r })),
  ];

  if (items.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No renewals to show.</p>;
  }

  return (
    <ol className="border-border/60 relative ml-3 border-l">
      {items.map((it, idx) => {
        const isPast = it.kind === 'past';
        const dot = isPast ? 'bg-muted border-border' : urgencyColor((it.row as Renewal).daysOut);
        return (
          <li
            key={`${it.kind}-${it.row.id}`}
            className={'pb-6 pl-6 ' + (idx === items.length - 1 ? '!pb-0' : '')}
          >
            <span
              className={'absolute -left-[7px] mt-1 size-3 rounded-full border-2 ' + dot}
              aria-hidden
            />
            <div className={isPast ? 'opacity-60' : ''}>
              <div className="text-sm font-medium">{it.row.label}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {TYPE_LABEL[it.row.type]} ·{' '}
                {isPast
                  ? `Completed ${(it.row as PastRenewal).completedAt}`
                  : `Due ${(it.row as Renewal).dueDate} · ${(it.row as Renewal).daysOut} days out`}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
