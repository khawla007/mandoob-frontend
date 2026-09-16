import { BlogTaxonomyManager } from '@/components/blog/BlogTaxonomyManager';
import { requireRole } from '@/lib/auth/require-role';
import { listBlogTerms } from '@/lib/data/blog';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function AdminBlogAttributesPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms.taxonomy.attributes');
  const terms = await listBlogTerms('attribute');

  return (
    <div className="admin-management-signal taxonomy-attributes-workspace admin-taxonomy-workspace">
      <div className="admin-taxonomy-heading">
        <p className="admin-taxonomy-eyebrow">{t('eyebrow')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>
      <BlogTaxonomyManager kind="attribute" terms={terms} />
    </div>
  );
}
