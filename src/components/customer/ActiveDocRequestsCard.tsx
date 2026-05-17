import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { OpenRequestEntry } from '@/lib/data/documents';
import type { DocType } from '@/lib/validation/document';

// TODO i18n: doc-type labels are domain-specific; queued for Arabic review (surface=customer.documents).
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

type RenewalsTranslator = Awaited<ReturnType<typeof getTranslations<'renewals'>>>;

function relativeDue(iso: string | null, tRenewals: RenewalsTranslator): string | null {
  if (!iso) return null;
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days < 0) return tRenewals('daysOverdue', { days: Math.abs(days) });
  if (days === 0) return tRenewals('dueToday');
  if (days === 1) return tRenewals('dueTomorrow');
  return tRenewals('dueInDays', { days });
}

export async function ActiveDocRequestsCard({
  rows,
  slug,
}: {
  rows: OpenRequestEntry[];
  slug: string;
}) {
  const t = await getTranslations('customer');
  const tRenewals = await getTranslations('renewals');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('activeDocumentRequests')}</CardTitle>
        <CardDescription>
          <Link
            href={`/t/${slug}/portal/documents`}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {t('viewAllDocuments')}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('noActiveRequests')}</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {rows.map((r) => {
              const due = relativeDue(r.dueAt, tRenewals);
              return (
                <li key={r.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      {DOC_TYPE_LABELS[r.docType]}
                      {due && <> · {due}</>}
                    </div>
                  </div>
                  <Badge variant="secondary">{t('pendingUpload')}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
