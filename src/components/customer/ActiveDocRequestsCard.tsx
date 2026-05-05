import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OpenRequestEntry } from '@/lib/data/documents';
import type { DocType } from '@/lib/validation/document';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  passport: 'Passport',
  visa: 'Visa',
  emirates_id: 'Emirates ID',
  trade_license: 'Trade license',
  ejari: 'Ejari',
  moa: 'MoA',
  shareholder_id: 'Shareholder ID',
  other: 'Other',
};

function relativeDue(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function ActiveDocRequestsCard({ rows, slug }: { rows: OpenRequestEntry[]; slug: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Active document requests</CardTitle>
        <CardDescription>
          <Link
            href={`/t/${slug}/portal/documents`}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            View all documents
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No active document requests.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((r) => {
              const due = relativeDue(r.dueAt);
              return (
                <li key={r.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {DOC_TYPE_LABELS[r.docType]}
                      {due && <> · {due}</>}
                    </div>
                  </div>
                  <Badge variant="secondary">Pending upload</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
