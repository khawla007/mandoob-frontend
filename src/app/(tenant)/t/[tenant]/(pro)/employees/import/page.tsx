import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmployeeImportForm } from '@/components/pro/EmployeeImportForm';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import { uploadBulkImportAction } from '../../imports/actions';

export const dynamic = 'force-dynamic';

export default async function EmployeeImportPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const { session } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company) notFound();
  const t = await getTranslations('pro.employeeImport');

  async function upload(
    _previous: Awaited<ReturnType<typeof uploadBulkImportAction>> | null,
    formData: FormData,
  ) {
    'use server';
    return uploadBulkImportAction(slug, formData);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
        </div>
        <Button variant="outline" asChild className="min-h-11 sm:min-h-9">
          <Link href={`/t/${slug}/employees`}>{t('back')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('cardTitle')}</CardTitle>
          <CardDescription>{t('cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeImportForm
            action={upload}
            jobPath={`/t/${encodeURIComponent(slug)}/imports`}
            labels={{
              file: t('file'),
              guidance: t('guidance'),
              upload: t('upload'),
              pending: t('pending'),
              resultReady: t('resultReady'),
              resultError: t('resultError'),
            }}
          />
          <Button variant="outline" asChild className="mt-3 min-h-11 sm:min-h-9">
            <Link href="/templates/employees-import-template.csv">{t('template')}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
