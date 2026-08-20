import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Building2, CalendarDays, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AssignedCompanyTabs } from '@/components/pro/AssignedCompanyTabs';
import { CompanyProfileForm } from '@/components/pro/CompanyProfileForm';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { loadAssignedCompanyWorkspace } from '@/lib/data/company-workspace';
import { DOC_TYPES } from '@/lib/validation/document';
import { parseAssignedCompanySearch, type AssignedCompanySearchParams } from './page-logic';

export const dynamic = 'force-dynamic';

export default async function AssignedCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<AssignedCompanySearchParams>;
}) {
  const { tenant: slug } = await params;
  const { session } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company) notFound();

  const [focus, t, tDocumentTypes, locale] = await Promise.all([
    searchParams.then(parseAssignedCompanySearch),
    getTranslations('pro.assignedCompany'),
    getTranslations('proDocumentCenter.docTypes'),
    getLocale(),
  ]);
  const workspace = await loadAssignedCompanyWorkspace(company.tenantId, company.id, focus);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  });

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-signal-accent-copy font-mono text-xs tracking-[0.14em] uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('description')}</p>
        </div>
        <Badge variant="outline" className="min-h-8 w-fit gap-2 px-3">
          <span className="bg-signal-success size-2 rounded-full" aria-hidden="true" />
          {t('assignmentActive')}
        </Badge>
      </header>

      <section
        className="signal-panel bg-card border-border/60 grid gap-5 rounded-xl border p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        aria-labelledby="assigned-company-name"
      >
        <div className="flex min-w-0 items-start gap-4">
          <span className="bg-primary/10 text-primary grid size-12 shrink-0 place-items-center rounded-2xl">
            <Building2 className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="assigned-company-name" className="truncate text-xl font-semibold">
              {company.companyName}
            </h2>
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {company.jurisdiction ?? t('emptyValue')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden="true" />
                {company.licenseExpiry
                  ? t('licenseExpires', {
                      date: dateFormatter.format(
                        new Date(`${company.licenseExpiry}T00:00:00+04:00`),
                      ),
                    })
                  : t('licenseExpiryMissing')}
              </span>
            </div>
          </div>
        </div>
        <Badge variant="secondary">{t(`status.${company.status}`)}</Badge>
      </section>

      <AssignedCompanyTabs
        slug={slug}
        company={company}
        workspace={workspace}
        activeTab={focus.tab}
        focusedDocumentId={
          workspace.documents.status === 'ready' ? workspace.documents.focusedId : undefined
        }
        focusedRequestId={
          workspace.requests.status === 'ready' ? workspace.requests.focusedId : undefined
        }
        locale={locale}
        dateFormatter={dateFormatter}
        labels={{
          tabsLabel: t('tabsLabel'),
          tabs: {
            overview: t('tabs.overview'),
            documents: t('tabs.documents'),
            renewals: t('tabs.renewals'),
            payments: t('tabs.payments'),
            activity: t('tabs.activity'),
          },
          overviewDescription: t('overviewDescription'),
          statusValue: t(`status.${company.status}`),
          fields: {
            companyName: t('fields.companyName'),
            status: t('fields.status'),
            jurisdiction: t('fields.jurisdiction'),
            tradeLicense: t('fields.tradeLicense'),
            licenseExpiry: t('fields.licenseExpiry'),
            shareholders: t('fields.shareholders'),
            activities: t('fields.activities'),
          },
          emptyValue: t('emptyValue'),
          panelError: t('panelError'),
          updated: t('updated'),
          due: t('due'),
          expires: t('expires'),
          statusLabel: t('statusLabel'),
          operationalUnknown: t('operationalUnknown'),
          documentTypes: Object.fromEntries(
            DOC_TYPES.map((docType) => [docType, tDocumentTypes(docType)]),
          ),
          renewalStatuses: {
            upcoming: t('renewals.statuses.upcoming'),
            due_soon: t('renewals.statuses.due_soon'),
            overdue: t('renewals.statuses.overdue'),
            completed: t('renewals.statuses.completed'),
            cancelled: t('renewals.statuses.cancelled'),
          },
          paymentStatuses: {
            draft: t('payments.statuses.draft'),
            open: t('payments.statuses.open'),
            paid: t('payments.statuses.paid'),
            void: t('payments.statuses.void'),
            refunded: t('payments.statuses.refunded'),
            partially_refunded: t('payments.statuses.partially_refunded'),
          },
          auditActions: {
            created: t('activity.actions.created'),
            approved: t('activity.actions.approved'),
            rejected: t('activity.actions.rejected'),
            suspended: t('activity.actions.suspended'),
            reactivated: t('activity.actions.reactivated'),
            updated: t('activity.actions.updated'),
            completed: t('activity.actions.completed'),
            cancelled: t('activity.actions.cancelled'),
            unlocked: t('activity.actions.unlocked'),
            session_revoked: t('activity.actions.session_revoked'),
            invoice_created: t('activity.actions.invoice_created'),
            invoice_voided: t('activity.actions.invoice_voided'),
            invoice_marked_paid: t('activity.actions.invoice_marked_paid'),
            payment_initiated: t('activity.actions.payment_initiated'),
            payment_succeeded: t('activity.actions.payment_succeeded'),
            payment_failed: t('activity.actions.payment_failed'),
            refund_issued: t('activity.actions.refund_issued'),
            infected_blocked: t('activity.actions.infected_blocked'),
            reconciled: t('activity.actions.reconciled'),
            comms_skipped_opted_out: t('activity.actions.comms_skipped_opted_out'),
            lead_created: t('activity.actions.lead_created'),
            lead_assigned: t('activity.actions.lead_assigned'),
            lead_stage_changed: t('activity.actions.lead_stage_changed'),
            lead_note_added: t('activity.actions.lead_note_added'),
            erasure_requested: t('activity.actions.erasure_requested'),
            erasure_verified: t('activity.actions.erasure_verified'),
            erasure_approved: t('activity.actions.erasure_approved'),
            erasure_rejected: t('activity.actions.erasure_rejected'),
            erasure_completed: t('activity.actions.erasure_completed'),
            bulk_imported: t('activity.actions.bulk_imported'),
            meeting_slot_created: t('activity.actions.meeting_slot_created'),
            meeting_scheduled: t('activity.actions.meeting_scheduled'),
            meeting_cancelled: t('activity.actions.meeting_cancelled'),
            meeting_completed: t('activity.actions.meeting_completed'),
            meeting_recording_attached: t('activity.actions.meeting_recording_attached'),
            whatsapp_template_status_updated: t(
              'activity.actions.whatsapp_template_status_updated',
            ),
            service_case_created: t('activity.actions.service_case_created'),
            service_case_updated: t('activity.actions.service_case_updated'),
            company_pro_assigned: t('activity.actions.company_pro_assigned'),
            company_pro_released: t('activity.actions.company_pro_released'),
          },
          auditSources: {
            self_serve: t('activity.sources.self_serve'),
            system: t('activity.sources.system'),
            admin: t('activity.sources.admin'),
            manual: t('activity.sources.manual'),
            document_request: t('activity.sources.document_request'),
            service_cases: t('activity.sources.service_cases'),
            questionnaire: t('activity.sources.questionnaire'),
            renewal_reminder: t('activity.sources.renewal_reminder'),
            platform: t('activity.sources.platform'),
            tenant: t('activity.sources.tenant'),
            tenant_team: t('activity.sources.tenant_team'),
            inbound_keyword: t('activity.sources.inbound_keyword'),
          },
          documents: {
            title: t('documents.title'),
            description: t('documents.description'),
            open: t('documents.open'),
            uploaded: t('documents.uploaded'),
            requests: t('documents.requests'),
            requestPending: t('documents.requestPending'),
            emptyUploaded: t('documents.emptyUploaded'),
            emptyRequests: t('documents.emptyRequests'),
          },
          renewals: {
            title: t('renewals.title'),
            description: t('renewals.description'),
            open: t('renewals.open'),
            empty: t('renewals.empty'),
          },
          payments: {
            title: t('payments.title'),
            description: t('payments.description'),
            open: t('payments.open'),
            empty: t('payments.empty'),
          },
          activity: {
            title: t('activity.title'),
            description: t('activity.description'),
            empty: t('activity.empty'),
          },
        }}
      />

      <CompanyProfileForm
        tenantSlug={slug}
        company={company}
        labels={{
          title: t('form.title'),
          description: t('form.description'),
          companyName: t('fields.companyName'),
          tradeLicense: t('fields.tradeLicense'),
          jurisdiction: t('fields.jurisdiction'),
          licenseExpiry: t('fields.licenseExpiry'),
          save: t('form.save'),
          saving: t('form.saving'),
          saved: t('form.saved'),
          validation: t('form.validation'),
          notFound: t('form.notFound'),
          conflict: t('form.conflict'),
          unexpected: t('form.unexpected'),
          errors: {
            companyNameRequired: t('form.errors.companyNameRequired'),
            companyNameTooLong: t('form.errors.companyNameTooLong'),
            tradeLicenseTooLong: t('form.errors.tradeLicenseTooLong'),
            jurisdictionTooLong: t('form.errors.jurisdictionTooLong'),
            licenseExpiryInvalid: t('form.errors.licenseExpiryInvalid'),
            validation: t('form.validation'),
          },
        }}
      />
    </div>
  );
}
