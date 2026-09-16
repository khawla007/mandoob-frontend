import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageEditor } from '@/components/pages/PageEditor';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/require-role';
import { getAdminCmsPage } from '@/lib/data/pages';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';
export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms.pages');
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsed.success) notFound();
  const page = await getAdminCmsPage(parsed.data);
  if (!page) notFound();
  return (
    <div className="admin-management-signal pages-management-workspace admin-editorial-workspace">
      <header className="admin-editorial-heading">
        <Button asChild variant="ghost" size="sm" className="-ms-3 mb-3">
          <Link href="/admin/pages">
            <ArrowLeft className="rtl:rotate-180" />
            {t('library')}
          </Link>
        </Button>
        <p className="admin-editorial-eyebrow">{t('editing')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{page.title}</h1>
        <p className="text-muted-foreground mt-1 font-mono text-xs">/{page.slug}</p>
      </header>
      <PageEditor page={page} />
    </div>
  );
}
