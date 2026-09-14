import { getLocale, getTranslations } from 'next-intl/server';
import { IdCard, Landmark, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { VisaProcessWorkspace } from '@/components/registration/VisaProcessWorkspace';
import { VISA_MILESTONE_CODES, type VisaMilestoneCode } from '@/lib/registration/contracts';
import { loadVisaPresentation } from '@/lib/registration/unavailable-adapter';
import {
  authorizeEmployeePortalRead,
  classifyEmployeeDeadline,
  type EmployeeDeadline,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback;
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Dubai', dateStyle: 'long' }).format(
    new Date(`${value}T12:00:00.000Z`),
  );
}

function IdentityPanel({
  id,
  title,
  description,
  masked,
  expiry,
  deadline,
  locale,
  labels,
}: {
  id: string;
  title: string;
  description: string;
  masked: string | null;
  expiry: string | null;
  deadline: EmployeeDeadline;
  locale: string;
  labels: {
    identifier: string;
    expiry: string;
    missing: string;
    lifecycle: string;
    deadline: string;
  };
}) {
  return (
    <Card id={id} className="signal-panel min-w-0 scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard aria-hidden="true" className="size-5" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">{labels.identifier}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{masked ?? labels.missing}</dd>
            <dd className="mt-3">
              <Badge variant="outline">{labels.lifecycle}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{labels.expiry}</dt>
            <dd className="mt-1 font-medium">{formatDate(expiry, locale, labels.missing)}</dd>
            <dd className="mt-3">
              <Badge
                variant={
                  deadline.kind === 'overdue' || deadline.kind === 'status-conflict'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {labels.deadline}
              </Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function EmployeeIdentityPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [t, tCommon, tDeadline, tRegistration, locale, visaState] = await Promise.all([
    getTranslations('employee.identity'),
    getTranslations('employee.common'),
    getTranslations('employee.deadline'),
    getTranslations('registration'),
    getLocale(),
    loadVisaPresentation(),
  ]);
  const visaDeadline = classifyEmployeeDeadline(access.employee.visaExpiry, 'identity-date');
  const eidDeadline = classifyEmployeeDeadline(access.employee.eidExpiry, 'identity-date');
  const deadline = (value: EmployeeDeadline) =>
    tDeadline(value.kind, { count: Math.abs(value.daysOut ?? 0) });
  const labels = (value: EmployeeDeadline) => ({
    identifier: tCommon('identifier'),
    expiry: tCommon('expiry'),
    missing: tCommon('notRecorded'),
    lifecycle: tCommon('lifecycleUnavailable'),
    deadline: deadline(value),
  });

  return (
    <div className="signal-dashboard space-y-5">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <div className="bg-muted/40 flex gap-3 rounded-xl border p-4 text-sm leading-6">
        <ShieldCheck aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
        <p>{t('privacy')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <IdentityPanel
          id="visa"
          title={t('visaTitle')}
          description={t('visaDescription')}
          masked={access.employee.visaMasked}
          expiry={access.employee.visaExpiry}
          deadline={visaDeadline}
          locale={locale}
          labels={labels(visaDeadline)}
        />
        <IdentityPanel
          id="emirates-id"
          title={t('eidTitle')}
          description={t('eidDescription')}
          masked={access.employee.emiratesIdMasked}
          expiry={access.employee.eidExpiry}
          deadline={eidDeadline}
          locale={locale}
          labels={labels(eidDeadline)}
        />
      </div>
      <Card id="passport" className="signal-panel scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark aria-hidden="true" className="size-5" /> {t('passportTitle')}
          </CardTitle>
          <CardDescription>{t('passportDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">{tCommon('identifier')}</dt>
              <dd className="mt-1 font-mono font-semibold">
                {access.employee.passportMasked ?? tCommon('notRecorded')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('nationality')}</dt>
              <dd className="mt-1 font-medium">
                {access.employee.nationality ?? tCommon('notRecorded')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <VisaProcessWorkspace
        state={visaState}
        labels={{
          title: tRegistration('employee.title'),
          description: tRegistration('employee.description'),
          unavailable: tRegistration('states.visaUnavailable'),
          blocker: tRegistration('workspace.blockerTitle'),
          nextAction: tRegistration('workspace.nextActionTitle'),
          documents: tRegistration('workspace.documentsTitle'),
          history: tRegistration('workspace.historyTitle'),
          milestones: Object.fromEntries(
            VISA_MILESTONE_CODES.map((code) => [code, tRegistration(`visa.${code}`)]),
          ) as Record<VisaMilestoneCode, string>,
        }}
      />
    </div>
  );
}
