import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Renewal } from '@/lib/mocks/customer-portal';

const TYPE_LABEL: Record<Renewal['type'], string> = {
  license: 'License',
  visa: 'Visa',
  eid: 'Emirates ID',
  ejari: 'Ejari',
};

function chipColor(daysOut: number): string {
  if (daysOut <= 30) return 'bg-destructive/10 text-destructive border-destructive/40';
  if (daysOut <= 90)
    return 'bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-400';
  return 'bg-muted text-muted-foreground border-border';
}

export function UpcomingRenewalsCard({ rows, slug }: { rows: Renewal[]; slug: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upcoming renewals</CardTitle>
        <CardDescription>
          <Link
            href={`/t/${slug}/portal/renewals`}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            View renewals timeline
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No renewals due in the next year.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div>
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {TYPE_LABEL[r.type]} · {r.dueDate}
                  </div>
                </div>
                <span
                  className={
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ' +
                    chipColor(r.daysOut)
                  }
                >
                  {r.daysOut} d
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
