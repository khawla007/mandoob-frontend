import Link from 'next/link';
import { Activity, ArrowUpRight, CalendarClock, CreditCard, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AssignedCompanyProfile } from '@/lib/data/company-profile';
import type { CompanyOnboardingSnapshot } from '@/lib/data/company-onboarding';
import type { CompanyPanelState, CompanyWorkspace } from '@/lib/data/company-workspace';
import type { CompanyReadinessSection } from '@/lib/company-onboarding/contracts';
import type { AssignedCompanyTab } from '@/app/(tenant)/t/[tenant]/(pro)/company/page-logic';
import { formatCompanyMoney, localizeOperationalValue } from './assigned-company-formatting';
import { AssignedCompanyOverview } from './AssignedCompanyOverview';

type Labels = {
  tabsLabel: string;
  tabs: Record<AssignedCompanyTab, string>;
  overviewDescription: string;
  statusValue: string;
  fields: {
    companyName: string;
    status: string;
    jurisdiction: string;
    tradeLicense: string;
    licenseExpiry: string;
    shareholders: string;
    activities: string;
  };
  emptyValue: string;
  panelError: string;
  updated: string;
  due: string;
  expires: string;
  statusLabel: string;
  operationalUnknown: string;
  documentTypes: Record<string, string>;
  renewalStatuses: Record<string, string>;
  paymentStatuses: Record<string, string>;
  auditActions: Record<string, string>;
  auditSources: Record<string, string>;
  documents: {
    title: string;
    description: string;
    open: string;
    uploaded: string;
    requests: string;
    requestPending: string;
    emptyUploaded: string;
    emptyRequests: string;
  };
  renewals: { title: string; description: string; open: string; empty: string };
  payments: { title: string; description: string; open: string; empty: string };
  activity: { title: string; description: string; empty: string };
  profile: React.ComponentProps<typeof AssignedCompanyOverview>['labels'];
};

export function AssignedCompanyTabs({
  slug,
  company,
  profile,
  workspace,
  activeTab,
  focusedDocumentId,
  focusedRequestId,
  locale,
  dateFormatter,
  sectionHrefs,
  labels,
}: {
  slug: string;
  company: AssignedCompanyProfile;
  profile: CompanyPanelState<CompanyOnboardingSnapshot>;
  workspace: CompanyWorkspace;
  activeTab: AssignedCompanyTab;
  focusedDocumentId?: string;
  focusedRequestId?: string;
  locale: string;
  dateFormatter: Intl.DateTimeFormat;
  sectionHrefs: Record<CompanyReadinessSection, string>;
  labels: Labels;
}) {
  const base = `/t/${encodeURIComponent(slug)}/company`;

  return (
    <Card className="signal-panel overflow-hidden">
      <nav
        className="border-border/60 overflow-x-auto border-b px-3 py-2"
        aria-label={labels.tabsLabel}
      >
        <div className="flex min-w-max gap-1">
          {(Object.keys(labels.tabs) as AssignedCompanyTab[]).map((tab) => (
            <Button
              key={tab}
              asChild
              size="sm"
              variant={tab === activeTab ? 'secondary' : 'ghost'}
              className="min-h-11 sm:min-h-9"
            >
              <Link
                href={
                  tab === 'documents'
                    ? buildDocumentHref(base, focusedDocumentId, focusedRequestId)
                    : `${base}?tab=${tab}`
                }
                aria-current={tab === activeTab ? 'page' : undefined}
              >
                {labels.tabs[tab]}
              </Link>
            </Button>
          ))}
        </div>
      </nav>

      {activeTab === 'overview' ? (
        <CardContent className="pt-6">
          <p className="text-muted-foreground mb-5 text-sm">{labels.overviewDescription}</p>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={labels.fields.companyName} value={company.companyName} />
            <Field
              label={labels.fields.status}
              value={<Badge variant="secondary">{labels.statusValue}</Badge>}
            />
            <Field
              label={labels.fields.jurisdiction}
              value={company.jurisdiction ?? labels.emptyValue}
            />
            <Field
              label={labels.fields.tradeLicense}
              value={company.tradeLicenseNo ?? labels.emptyValue}
              mono
            />
            <Field
              label={labels.fields.licenseExpiry}
              value={formatBusinessDate(company.licenseExpiry, dateFormatter, labels.emptyValue)}
            />
            <Field
              label={labels.fields.shareholders}
              value={String(company.shareholderCount)}
              mono
            />
            <Field
              label={labels.fields.activities}
              value={String(company.registeredActivityCount)}
              mono
            />
          </dl>
          <div className="mt-6 border-t pt-6">
            <AssignedCompanyOverview
              company={company}
              profile={profile}
              locale={locale}
              dateFormatter={dateFormatter}
              sectionHrefs={sectionHrefs}
              labels={labels.profile}
            />
          </div>
        </CardContent>
      ) : null}

      {activeTab === 'documents' ? (
        <ModulePanel
          icon={FileText}
          title={labels.documents.title}
          description={labels.documents.description}
          href={`/t/${encodeURIComponent(slug)}/documents`}
          action={labels.documents.open}
        >
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <PanelList
              title={labels.documents.requests}
              state={workspace.requests}
              empty={labels.documents.emptyRequests}
              error={labels.panelError}
              render={(request) => (
                <WorkspaceRow
                  key={request.id}
                  id={`document-request-${request.id}`}
                  focused={focusedRequestId === request.id}
                  title={request.label}
                  meta={`${localizeOperationalValue(labels.documentTypes, request.docType, labels.operationalUnknown)} · ${labels.documents.requestPending}${request.dueAt ? ` · ${labels.due} ${formatBusinessDate(request.dueAt, dateFormatter, labels.emptyValue)}` : ''}`}
                  href={`/t/${encodeURIComponent(slug)}/documents?request=${encodeURIComponent(request.id)}`}
                />
              )}
            />
            <PanelList
              title={labels.documents.uploaded}
              state={workspace.documents}
              empty={labels.documents.emptyUploaded}
              error={labels.panelError}
              render={(document) => (
                <WorkspaceRow
                  key={document.id}
                  id={`document-${document.id}`}
                  focused={focusedDocumentId === document.id}
                  title={
                    document.label ??
                    localizeOperationalValue(
                      labels.documentTypes,
                      document.docType,
                      labels.operationalUnknown,
                    )
                  }
                  meta={`${localizeOperationalValue(labels.documentTypes, document.docType, labels.operationalUnknown)} · ${labels.updated} ${formatTimestamp(document.updatedAt, dateFormatter)}${document.expiresOn ? ` · ${labels.expires} ${formatBusinessDate(document.expiresOn, dateFormatter, labels.emptyValue)}` : ''}`}
                  href={`/t/${encodeURIComponent(slug)}/documents?document=${encodeURIComponent(document.id)}`}
                />
              )}
            />
          </div>
        </ModulePanel>
      ) : null}

      {activeTab === 'renewals' ? (
        <ModulePanel
          icon={CalendarClock}
          title={labels.renewals.title}
          description={labels.renewals.description}
          href={`/t/${encodeURIComponent(slug)}/renewals`}
          action={labels.renewals.open}
        >
          <PanelList
            state={workspace.renewals}
            empty={labels.renewals.empty}
            error={labels.panelError}
            render={(renewal) => (
              <WorkspaceRow
                key={renewal.id}
                title={renewal.label}
                meta={`${labels.due} ${formatBusinessDate(renewal.dueDate, dateFormatter, labels.emptyValue)} · ${labels.statusLabel} ${localizeOperationalValue(labels.renewalStatuses, renewal.status, labels.operationalUnknown)}`}
                href={`/t/${encodeURIComponent(slug)}/renewals?renewal=${encodeURIComponent(renewal.id)}`}
              />
            )}
          />
        </ModulePanel>
      ) : null}

      {activeTab === 'payments' ? (
        <ModulePanel
          icon={CreditCard}
          title={labels.payments.title}
          description={labels.payments.description}
          href={`/t/${encodeURIComponent(slug)}/payments`}
          action={labels.payments.open}
        >
          <PanelList
            state={workspace.payments}
            empty={labels.payments.empty}
            error={labels.panelError}
            render={(invoice) => (
              <WorkspaceRow
                key={invoice.id}
                title={invoice.label}
                meta={`${formatCompanyMoney(invoice.amountMinor, invoice.currency, locale)} · ${labels.statusLabel} ${localizeOperationalValue(labels.paymentStatuses, invoice.status, labels.operationalUnknown)}${invoice.dueAt ? ` · ${labels.due} ${formatTimestamp(invoice.dueAt, dateFormatter)}` : ''}`}
                href={`/t/${encodeURIComponent(slug)}/payments/${encodeURIComponent(invoice.id)}`}
              />
            )}
          />
        </ModulePanel>
      ) : null}

      {activeTab === 'activity' ? (
        <ModulePanel
          icon={Activity}
          title={labels.activity.title}
          description={labels.activity.description}
        >
          <PanelList
            state={workspace.activity}
            empty={labels.activity.empty}
            error={labels.panelError}
            render={(entry) => (
              <WorkspaceRow
                key={entry.id}
                title={localizeOperationalValue(
                  labels.auditActions,
                  entry.action,
                  labels.operationalUnknown,
                )}
                meta={`${localizeOperationalValue(labels.auditSources, entry.source, labels.operationalUnknown)} · ${formatTimestamp(entry.createdAt, dateFormatter)}`}
              />
            )}
          />
        </ModulePanel>
      ) : null}
    </Card>
  );
}

function buildDocumentHref(base: string, documentId?: string, requestId?: string): string {
  if (documentId) return `${base}?tab=documents&document=${encodeURIComponent(documentId)}`;
  if (requestId) return `${base}?tab=documents&request=${encodeURIComponent(requestId)}`;
  return `${base}?tab=documents`;
}

function formatBusinessDate(
  value: string | null,
  formatter: Intl.DateTimeFormat,
  empty: string,
): string {
  return value ? formatter.format(new Date(`${value}T00:00:00+04:00`)) : empty;
}

function formatTimestamp(value: string, formatter: Intl.DateTimeFormat): string {
  return formatter.format(new Date(value));
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className={`mt-1 text-sm break-words ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}

function PanelList<T>({
  title,
  state,
  empty,
  error,
  render,
}: {
  title?: string;
  state: CompanyPanelState<T[]>;
  empty: string;
  error: string;
  render: (row: T) => React.ReactNode;
}) {
  if (state.status === 'unrequested') return null;

  return (
    <section className="min-w-0 space-y-2">
      {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
      {state.status === 'error' ? (
        <p
          className="text-destructive rounded-lg border border-current/20 px-3 py-4 text-sm"
          role="status"
        >
          {error}
        </p>
      ) : state.data.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-sm">
          {empty}
        </p>
      ) : (
        <ul className="divide-border/60 divide-y rounded-lg border">{state.data.map(render)}</ul>
      )}
    </section>
  );
}

function WorkspaceRow({
  id,
  focused = false,
  title,
  meta,
  href,
}: {
  id?: string;
  focused?: boolean;
  title: string;
  meta: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="font-medium break-words">{title}</span>
      <span className="text-muted-foreground text-xs break-words">{meta}</span>
    </>
  );
  return (
    <li
      id={id}
      aria-current={focused ? 'true' : undefined}
      className={`min-w-0 p-3 text-sm ${focused ? 'ring-primary ring-2 ring-inset' : ''}`}
    >
      {href ? (
        <Link
          href={href}
          className="focus-visible:ring-ring flex min-h-11 flex-col justify-center gap-1 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
        >
          {content}
        </Link>
      ) : (
        <div className="flex min-h-11 flex-col justify-center gap-1">{content}</div>
      )}
    </li>
  );
}

function ModulePanel({
  icon: Icon,
  title,
  description,
  href,
  action,
  children,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
  href?: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-xl">
            <Icon className="text-muted-foreground size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {children}
        {href && action ? (
          <div className="flex justify-end">
            <Button asChild variant="outline" className="min-h-11 w-full sm:min-h-9 sm:w-auto">
              <Link href={href}>
                {action}
                <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </>
  );
}
