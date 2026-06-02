import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { CreateProFirmForm } from '@/components/admin/CreateProFirmForm';

export const dynamic = 'force-dynamic';

export default async function NewProFirmPage() {
  await requireRole('super_admin');
  const t = await getTranslations('admin');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('proFirms.newPage.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('proFirms.newPage.intro')}</p>
      </div>
      <CreateProFirmForm />
    </div>
  );
}
