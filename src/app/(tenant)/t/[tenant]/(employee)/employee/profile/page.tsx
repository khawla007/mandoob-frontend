import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Building2, FileText, IdCard, Settings, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  authorizeEmployeePortalRead,
  employeePortalHref,
  loadEmployeeAssignment,
} from '@/lib/data/employee-portal-workspace';

export const dynamic = 'force-dynamic';

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeEmployeePortalRead(slug);
  const [assignment, t, tCommon, tActions] = await Promise.all([
    loadEmployeeAssignment(access),
    getTranslations('employee.profile'),
    getTranslations('employee.common'),
    getTranslations('employee.actions'),
  ]);
  const href = (route: Parameters<typeof employeePortalHref>[1]) =>
    employeePortalHref(access.tenant.slug, route);
  const assignmentState =
    assignment.kind === 'missing'
      ? t('assignmentMissing')
      : assignment.kind === 'released'
        ? t('assignmentReleased')
        : assignment.kind === 'unavailable'
          ? t('assignmentUnavailable')
          : assignment.kind === 'error'
            ? t('assignmentError')
            : null;

  return (
    <div className="signal-dashboard space-y-5">
      <header className="signal-dashboard__heading">
        <p className="signal-dashboard__eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="size-5" /> {t('employeeTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">{tActions('profile')}</dt>
                <dd className="mt-1 font-medium">
                  {access.employee.name ?? tCommon('notRecorded')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('employmentStatus')}</dt>
                <dd className="mt-1">
                  <Badge variant="outline">{t('active')}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{tCommon('identifier')}</dt>
                <dd className="mt-1 font-mono">
                  {access.employee.passportMasked ?? tCommon('notRecorded')}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 aria-hidden="true" className="size-5" /> {t('companyTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {access.company?.kind === 'active' ? (
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{tCommon('company')}</dt>
                  <dd className="mt-1 font-medium">
                    {access.company.name ?? tCommon('notRecorded')}
                  </dd>
                </div>
              </dl>
            ) : (
              <p role="status" className="text-muted-foreground text-sm">
                {access.company?.kind === 'inactive' ? t('companyInactive') : t('companyMissing')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{t('proTitle')}</CardTitle>
            <CardDescription>{t('proDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {assignment.kind === 'active' ? (
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('proName')}</dt>
                  <dd className="mt-1 font-medium">
                    {assignment.value.name ?? tCommon('notRecorded')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('proTitleField')}</dt>
                  <dd className="mt-1">{assignment.value.title ?? tCommon('notRecorded')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tCommon('assignedPro')}</dt>
                  <dd className="mt-1">{tCommon('contactUnavailable')}</dd>
                </div>
              </dl>
            ) : (
              <p role="status" className="text-muted-foreground text-sm">
                {assignmentState}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <section className="signal-panel p-5" aria-labelledby="profile-links-title">
        <h2 id="profile-links-title" className="font-semibold">
          {t('linksTitle')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [tActions('visa'), href('identity'), IdCard],
            [tActions('documents'), href('documents'), FileText],
            [tActions('renewals'), href('renewals'), Building2],
            [tActions('settings'), href('settings'), Settings],
          ].map(([label, destination, Icon]) => (
            <Link
              key={String(destination)}
              href={String(destination)}
              className="bg-muted/35 flex min-h-12 items-center gap-3 rounded-lg border p-3 text-sm font-medium"
            >
              <Icon aria-hidden="true" className="text-primary size-4" /> {String(label)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
