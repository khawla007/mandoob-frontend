import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceActions } from '@/components/pro/InvoiceActions';
import { formatFinanceDate } from '@/lib/format/finance-date';
import { requireActiveTenant } from '@/lib/auth/require-active-tenant';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { getInvoiceDetailForTenant } from '@/lib/data/invoices';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { listBankEvidenceReviewQueue } from '@/lib/finance/bank-evidence-review';
import { BankEvidenceReviewPanel } from '@/components/finance/BankEvidenceReviewPanel';
import { openBankEvidenceAction, reviewBankEvidenceAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ProInvoiceDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; invoiceId: string }>;
}) {
  const { tenant: slug, invoiceId } = await params;
  const { session, tenant } = await requireProTenantRouteAccess(slug);
  await requireActiveTenant(tenant.id);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const invoice = await getInvoiceDetailForTenant(tenant.id, company.id, session.id, invoiceId);
  if (!invoice) notFound();
  const [locale, t, evidenceRows] = await Promise.all([
    getLocale(),
    getTranslations('pro'),
    listBankEvidenceReviewQueue({ tenantId: tenant.id, companyId: company.id, invoiceId }),
  ]);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11 w-fit">
        <Link href={`/t/${tenant.slug}/payments`}>
          <ChevronLeft className="size-4" />
          {t('paymentBack')}
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.label}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={invoice.status === 'open' ? 'default' : 'secondary'}>
              {invoiceStatusLabel(invoice.status, t)}
            </Badge>
            <span className="text-muted-foreground">{invoice.amount}</span>
            <span className="text-muted-foreground">· {invoice.companyName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {invoice.receiptAvailable ? (
            <Button asChild variant="outline">
              <Link href={`/t/${tenant.slug}/payments/${invoice.id}/receipt`} target="_blank">
                {t('paymentReceipt')}
              </Link>
            </Button>
          ) : (
            <p className="text-muted-foreground max-w-56 text-sm">
              {t('paymentReceiptUnavailable')}
            </p>
          )}
          <InvoiceActions
            slug={tenant.slug}
            invoiceId={invoice.id}
            version={invoice.version}
            paymentId={invoice.paymentId}
            amountMinor={invoice.amountMinor}
            outstandingMinor={invoice.outstandingMinor}
            currency={invoice.currency}
            remainingRefundableMinor={invoice.remainingRefundableMinor}
            status={invoice.status}
            refundOperation={invoice.refundOperation}
            refundDetailsLoaded={invoice.refundDetailsLoaded}
            bankEvidenceSubmissionId={evidenceRows.find((row) => row.state === 'clean')?.id}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentInvoiceDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('paymentInvoiceId')} value={invoice.id} mono />
            <Field label={t('paymentCompany')} value={invoice.companyName} />
            <Field
              label={t('paymentDueDate')}
              value={formatInvoiceDate(invoice.dueAt, locale, t('paymentDateUnavailable'))}
            />
            <Field
              label={t('paymentPaidAt')}
              value={formatInvoiceDate(invoice.paidAt, locale, t('paymentDateUnavailable'))}
            />
            <Field label={t('paymentLinkedEntity')} value={invoice.linkedEntityType ?? '—'} />
          </dl>
        </CardContent>
      </Card>

      <BankEvidenceReviewPanel
        rows={evidenceRows}
        reviewAction={reviewBankEvidenceAction}
        openAction={openBankEvidenceAction}
        tenantSlug={tenant.slug}
        labels={{
          title: t('bankEvidence.title'),
          description: t('bankEvidence.description'),
          empty: t('bankEvidence.empty'),
          open: t('bankEvidence.open'),
          clean: t('bankEvidence.clean'),
          reject: t('bankEvidence.reject'),
          rejectTitle: t('bankEvidence.rejectTitle'),
          rejectDescription: t('bankEvidence.rejectDescription'),
          rejectReason: t('bankEvidence.rejectReason'),
          confirmReject: t('bankEvidence.confirmReject'),
          cancel: t('bankEvidence.cancel'),
          actionFailed: t('bankEvidence.actionFailed'),
          states: Object.fromEntries(
            ['pending', 'clean', 'rejected', 'reconciled', 'expired', 'held', 'tombstoned'].map(
              (state) => [state, t(`bankEvidence.states.${state}`)],
            ),
          ),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentAttemptsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.sections.payments === 'unavailable' ? (
            <p className="text-muted-foreground text-sm">{t('paymentDetailsUnavailable')}</p>
          ) : invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentAttemptsNone')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentStatus')}</TableHead>
                  <TableHead>{t('paymentProvider')}</TableHead>
                  <TableHead>{t('paymentMethod')}</TableHead>
                  <TableHead>{t('paymentAttempted')}</TableHead>
                  <TableHead>{t('paymentContext')}</TableHead>
                  <TableHead className="text-right">{t('paymentAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{paymentStatusLabel(payment.status, t)}</TableCell>
                    <TableCell>{paymentProviderLabel(payment.provider, t)}</TableCell>
                    <TableCell>{paymentMethodLabel(payment.method, t)}</TableCell>
                    <TableCell>
                      {formatInvoiceDate(payment.createdAt, locale, t('paymentDateUnavailable'))}
                    </TableCell>
                    <TableCell>{t(`paymentAttempt${payment.context}`)}</TableCell>
                    <TableCell className="text-right">{payment.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentReconciliation')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('paymentReconciliationUnavailable')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentRefunds')}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.sections.refunds === 'unavailable' ? (
            <p className="text-muted-foreground text-sm">{t('paymentDetailsUnavailable')}</p>
          ) : invoice.refunds.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentRefundsNone')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('paymentStatus')}</TableHead>
                  <TableHead>{t('paymentReason')}</TableHead>
                  <TableHead>{t('paymentCreated')}</TableHead>
                  <TableHead className="text-right">{t('paymentAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>{refundStatusLabel(refund.status, t)}</TableCell>
                    <TableCell>{refund.reason ?? '—'}</TableCell>
                    <TableCell>
                      {formatInvoiceDate(refund.createdAt, locale, t('paymentDateUnavailable'))}
                    </TableCell>
                    <TableCell className="text-right">{refund.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('paymentAudit')}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.sections.audit === 'unavailable' ? (
            <p className="text-muted-foreground text-sm">{t('paymentDetailsUnavailable')}</p>
          ) : invoice.audit.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('paymentAuditNone')}</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {invoice.audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-4 py-2 first:pt-0"
                >
                  <span className="font-medium">{auditActionLabel(entry.action, t)}</span>
                  <span className="text-muted-foreground">
                    {formatInvoiceDate(entry.createdAt, locale, t('paymentDateUnavailable'))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono break-all' : 'font-medium'}>{value}</dd>
    </div>
  );
}

function formatInvoiceDate(value: string | null, locale: string, unavailable: string) {
  return formatFinanceDate(value, locale, unavailable);
}

function paymentStatusLabel(status: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const known: Record<string, string> = {
    succeeded: 'paymentStatusSucceeded',
    failed: 'paymentStatusFailed',
    abandoned: 'paymentStatusAbandoned',
    initiated: 'paymentStatusInitiated',
    pending: 'paymentStatusPending',
    refunded: 'paymentStatusRefunded',
    partially_refunded: 'paymentStatusPartiallyRefunded',
  };
  return known[status] ? t(known[status]) : t('paymentValueUnavailable');
}

function paymentProviderLabel(provider: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  return provider === 'tap'
    ? t('paymentProviderTap')
    : provider === 'manual'
      ? t('paymentProviderManual')
      : t('paymentProviderUnavailable');
}

function paymentMethodLabel(method: string | null, t: Awaited<ReturnType<typeof getTranslations>>) {
  const known: Record<string, string> = {
    card: 'paymentMethodCard',
    cash: 'paymentMethodCash',
    bank_transfer: 'paymentMethodBankTransfer',
    mada: 'paymentMethodMada',
    apple_pay: 'paymentMethodApplePay',
  };
  return method && known[method] ? t(known[method]) : t('paymentMethodUnavailable');
}

function invoiceStatusLabel(status: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const known: Record<string, string> = {
    draft: 'paymentStatusDraft',
    open: 'paymentStatusOpen',
    paid: 'paymentStatusPaid',
    void: 'paymentStatusVoid',
    refunded: 'paymentStatusRefunded',
    partially_refunded: 'paymentStatusPartiallyRefunded',
  };
  return known[status] ? t(known[status]) : t('paymentValueUnavailable');
}

function refundStatusLabel(status: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const known: Record<string, string> = {
    succeeded: 'paymentStatusSucceeded',
    pending: 'paymentStatusPending',
    failed: 'paymentStatusFailed',
  };
  return known[status] ? t(known[status]) : t('paymentValueUnavailable');
}

function auditActionLabel(action: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const known: Record<string, string> = {
    invoice_created: 'paymentAuditInvoiceCreated',
    invoice_voided: 'paymentAuditInvoiceVoided',
    invoice_paid: 'paymentAuditInvoicePaid',
    invoice_marked_paid: 'paymentAuditInvoicePaid',
    refund_requested: 'paymentAuditRefundRequested',
    refund_succeeded: 'paymentAuditRefundSucceeded',
    refund_issued: 'paymentAuditRefundSucceeded',
  };
  return known[action] ? t(known[action]) : t('paymentValueUnavailable');
}
