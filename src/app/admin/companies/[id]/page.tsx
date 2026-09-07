import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  History,
  Link2,
  Unlink,
} from 'lucide-react';
import { z } from 'zod';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import type { CompanyAssignment } from '@/lib/data/company-assignments';
import {
  listCompanyAssignmentHistory,
  readCurrentCompanyAssignment,
} from '@/lib/data/company-assignments';
import { getCompanyById } from '@/lib/data/pro-firms';
import {
  readCompanyOnboarding,
  type CompanyOnboardingSnapshot,
} from '@/lib/data/company-onboarding';
import { CompanyAssignmentForm } from '@/components/admin/CompanyAssignmentForm';
import { companyAssignmentFormIdentity } from '@/components/admin/company-assignment-form-identity';
import { ReleaseCompanyProForm } from '@/components/admin/ReleaseCompanyProForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminCompanyOnboardingSectionHref,
  canonicalAdminCompanyOnboardingSection,
} from './onboarding/route-logic';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const operator = await requirePlatformOperator();
  const [{ id }, sp, t, tOnboarding, tRegistration, locale] = await Promise.all([
    params,
    searchParams,
    getTranslations('admin.companies'),
    getTranslations('companyOnboarding'),
    getTranslations('registration'),
    getLocale(),
  ]);
  if (!idSchema.safeParse(id).success) notFound();
  const company = await getCompanyById(id);
  if (!company) notFound();

  const onboarding = await readCompanyOnboarding({
    actorProfileId: operator.id,
    tenantId: company.tenantId,
    companyId: company.id,
  });
  if (!onboarding) notFound();
  const [currentAssignment, assignmentHistory] = await Promise.all([
    readCurrentCompanyAssignment(company.id, operator.id),
    listCompanyAssignmentHistory(company.id),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-6">
      {sp.created ? (
        <Alert aria-live="polite">
          <AlertTitle>{t('feedback.createdTitle')}</AlertTitle>
          <AlertDescription>{t('feedback.createdDescription')}</AlertDescription>
        </Alert>
      ) : null}

      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link href="/admin/companies">
          <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
          {t('detail.back')}
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
            {t('detail.eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">
            {company.companyName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={company.companyStatus === 'active' ? 'default' : 'outline'}>
              {t(`status.${company.companyStatus}`)}
            </Badge>
            <Badge variant="outline">{t(`plan.${company.plan}`)}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.stateDefinitions.title')}</CardTitle>
          <CardDescription>{t('detail.stateDefinitions.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('detail.stateDefinitions.legal')}
              </dt>
              <dd className="mt-1 font-medium">
                {tOnboarding('overview.progress', {
                  complete: Object.values(onboarding.sectionProgress).filter(
                    ({ status }) => status === 'complete',
                  ).length,
                  total: Object.keys(onboarding.sectionProgress).length,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('detail.stateDefinitions.activation')}
              </dt>
              <dd className="mt-1 font-medium">
                {tOnboarding(`status.${onboarding.onboardingStatus}`)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('detail.stateDefinitions.registration')}
              </dt>
              <dd className="mt-1 font-medium">
                {t('detail.stateDefinitions.registrationUnavailable')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('detail.stateDefinitions.lifecycle')}
              </dt>
              <dd className="mt-1 font-medium">{t(`status.${company.companyStatus}`)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('detail.stateDefinitions.assignment')}
              </dt>
              <dd className="mt-1 font-medium">
                {currentAssignment?.proFullName ?? t('table.unassigned')}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>{t('detail.profileTitle')}</CardTitle>
                  <CardDescription>{t('detail.profileDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs">{t('detail.workspace')}</dt>
                  <dd className="mt-1 font-medium">{company.workspaceName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('detail.slug')}</dt>
                  <dd className="mt-1 font-mono text-sm" dir="ltr">
                    {company.tenantSlug}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('detail.tradeLicense')}</dt>
                  <dd className="mt-1 text-sm">
                    {company.tradeLicenseNo ?? t('detail.notProvided')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t('detail.jurisdiction')}</dt>
                  <dd className="mt-1 text-sm">
                    {company.jurisdiction ?? t('detail.notProvided')}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <CompanyOnboardingAdminSummary
            onboarding={onboarding}
            currentAssignment={currentAssignment}
            onboardingHref={adminCompanyOnboardingSectionHref(
              company.id,
              canonicalAdminCompanyOnboardingSection(onboarding),
            )}
            labels={{
              title: tOnboarding('adminSummary.title'),
              description: tOnboarding('adminSummary.description'),
              lifecycle: tOnboarding('overview.lifecycle'),
              status: tOnboarding(`status.${onboarding.onboardingStatus}`),
              progress: tOnboarding('overview.progress', {
                complete: Object.values(onboarding.sectionProgress).filter(
                  ({ status }) => status === 'complete',
                ).length,
                total: Object.keys(onboarding.sectionProgress).length,
              }),
              blockers: tOnboarding('overview.blockers', {
                count: onboarding.requirements.length,
              }),
              assignment: currentAssignment
                ? tOnboarding('adminSummary.assigned', {
                    name: currentAssignment.proFullName ?? t('assignment.unnamedPro'),
                  })
                : tOnboarding('adminSummary.unassigned'),
              cta:
                canonicalAdminCompanyOnboardingSection(onboarding) === 'review'
                  ? tOnboarding('overview.review')
                  : tOnboarding('overview.resume'),
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>{tRegistration('admin.detailEyebrow')}</CardTitle>
              <CardDescription>{tRegistration('admin.detailDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/admin/registrations?company=${encodeURIComponent(company.companyName)}`}
                className="text-primary text-sm font-semibold underline underline-offset-4"
              >
                {tRegistration('admin.detailEyebrow')}
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
                  <Link2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <CardTitle>
                    {currentAssignment
                      ? t('assignment.reassignTitle')
                      : t('assignment.assignTitle')}
                  </CardTitle>
                  <CardDescription>{t('assignment.sectionDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CompanyAssignmentForm
                key={companyAssignmentFormIdentity(currentAssignment?.id)}
                companyId={company.id}
                currentAssignment={currentAssignment}
              />
            </CardContent>
          </Card>

          {currentAssignment ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="bg-destructive/10 text-destructive flex size-9 items-center justify-center rounded-xl">
                    <Unlink className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <CardTitle>{t('release.title')}</CardTitle>
                    <CardDescription>{t('release.description')}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ReleaseCompanyProForm
                  companyId={company.id}
                  companyName={company.companyName}
                  assignment={currentAssignment}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <History className="text-muted-foreground size-5" aria-hidden="true" />
                <div>
                  <CardTitle>{t('history.title')}</CardTitle>
                  <CardDescription>{t('history.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {assignmentHistory.length === 0 ? (
                <p className="text-muted-foreground px-6 pb-6 text-sm">{t('history.empty')}</p>
              ) : (
                <div className="overflow-x-auto" role="region" aria-label={t('history.tableLabel')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('history.pro')}</TableHead>
                        <TableHead>{t('history.state')}</TableHead>
                        <TableHead>{t('history.when')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignmentHistory.map((assignment) => (
                        <TableRow key={assignment.id}>
                          <TableCell className="min-w-36">
                            {assignment.proFullName ?? t('assignment.unnamedPro')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={assignment.status === 'active' ? 'default' : 'outline'}>
                              {t(`history.status.${assignment.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground min-w-40 text-xs">
                            {dateTime.format(new Date(assignment.assignedAt))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function CompanyOnboardingAdminSummary({
  onboarding,
  currentAssignment,
  onboardingHref,
  labels,
}: {
  onboarding: CompanyOnboardingSnapshot;
  currentAssignment: CompanyAssignment | null;
  onboardingHref: string;
  labels: {
    title: string;
    description: string;
    lifecycle: string;
    status: string;
    progress: string;
    blockers: string;
    assignment: string;
    cta: string;
  };
}) {
  const complete = Object.values(onboarding.sectionProgress).filter(
    ({ status }) => status === 'complete',
  ).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <p>
            {labels.lifecycle}: <span className="font-medium">{labels.status}</span>
          </p>
          <p className="inline-flex items-center gap-2">
            <CheckCircle2 className="text-signal-success size-4" aria-hidden="true" />
            {labels.progress}
          </p>
          <p>{labels.blockers}</p>
          <p data-assigned={currentAssignment ? 'true' : 'false'}>{labels.assignment}</p>
        </div>
        <Link
          href={onboardingHref}
          className="bg-primary text-primary-foreground focus-visible:ring-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2"
        >
          {labels.cta}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <span className="sr-only">{complete}</span>
      </CardContent>
    </Card>
  );
}
