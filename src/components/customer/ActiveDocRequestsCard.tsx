import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActiveDocRequest, DocRequestStatus } from '@/lib/mocks/customer-portal';

const STATUS_VARIANT: Record<DocRequestStatus, 'secondary' | 'default' | 'outline'> = {
  requested: 'secondary',
  uploaded: 'default',
  under_review: 'outline',
};

const STATUS_LABEL: Record<DocRequestStatus, string> = {
  requested: 'Requested',
  uploaded: 'Uploaded',
  under_review: 'Under review',
};

function relativeDue(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function ActiveDocRequestsCard({ rows, slug }: { rows: ActiveDocRequest[]; slug: string }) {
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
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {relativeDue(r.dueDate)}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
