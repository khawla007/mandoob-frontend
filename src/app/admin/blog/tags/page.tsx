import { BlogTaxonomyManager } from '@/components/blog/BlogTaxonomyManager';
import { requireRole } from '@/lib/auth/require-role';
import { listBlogTerms } from '@/lib/data/blog';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function AdminBlogTagsPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms.taxonomy.tags');
  const terms = await listBlogTerms('tag');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>
      <BlogTaxonomyManager kind="tag" terms={terms} />
    </div>
  );
}
