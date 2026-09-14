import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageEditor } from '@/components/pages/PageEditor';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/require-role';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';
export default async function NewAdminPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms.pages');
  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
          <Link href="/admin/pages">
            <ArrowLeft />
            {t('library')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('newTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('newDescription')}</p>
      </header>
      <PageEditor page={null} />
    </div>
  );
}
