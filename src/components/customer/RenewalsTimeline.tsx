import { getTranslations } from 'next-intl/server';
import type { PastRenewal, Renewal } from '@/lib/types/renewals-ui';

function urgencyColor(daysOut: number): string {
  if (daysOut <= 30) return 'bg-destructive border-destructive';
  if (daysOut <= 90) return 'bg-amber-500 border-amber-500';
  return 'bg-primary border-primary';
}

type Item = { kind: 'upcoming'; row: Renewal } | { kind: 'past'; row: PastRenewal };

export async function RenewalsTimeline({
  upcoming,
  past,
}: {
  upcoming: Renewal[];
  past: PastRenewal[];
}) {
  const t = await getTranslations('customer');
  const tPro = await getTranslations('pro');
  const tRenewals = await getTranslations('renewals');
  const typeLabel: Record<Renewal['type'], string> = {
    license: tPro('license'),
    visa: tPro('visa'),
    eid: tPro('emiratesId'),
    ejari: tPro('ejari'),
  };
  const items: Item[] = [
    ...upcoming.map((r) => ({ kind: 'upcoming' as const, row: r })),
    ...past.map((r) => ({ kind: 'past' as const, row: r })),
  ];

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{t('noRenewalsToShow')}</p>
    );
  }

  return (
    <ol className="border-border/60 relative ms-3 border-s">
      {items.map((it, idx) => {
        const isPast = it.kind === 'past';
        const dot = isPast ? 'bg-muted border-border' : urgencyColor((it.row as Renewal).daysOut);
        return (
          <li
            key={`${it.kind}-${it.row.id}`}
            className={'ps-6 pb-6 ' + (idx === items.length - 1 ? '!pb-0' : '')}
          >
            <span
              className={
                'absolute mt-1 size-3 -translate-x-1/2 rounded-full border-2 ltr:left-0 rtl:right-0 rtl:translate-x-1/2 ' +
                dot
              }
              aria-hidden
            />
            <div className={isPast ? 'opacity-60' : ''}>
              <div className="text-sm font-medium">{it.row.label}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {typeLabel[it.row.type]} ·{' '}
                {isPast
                  ? tRenewals('completedOn', { date: (it.row as PastRenewal).completedAt })
                  : tRenewals('dueOnWithDays', {
                      date: (it.row as Renewal).dueDate,
                      days: (it.row as Renewal).daysOut,
                    })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
