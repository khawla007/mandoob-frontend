import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { CreateCompanyForm } from '@/components/admin/CreateCompanyForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.companies');

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link href="/admin/companies">
          <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
          {t('new.back')}
        </Link>
      </Button>
      <div>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
          {t('page.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('new.title')}</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('new.intro')}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('new.cardTitle')}</CardTitle>
          <CardDescription>{t('new.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm />
        </CardContent>
      </Card>
    </div>
  );
}
