import { BlogEditor } from '@/components/blog/BlogEditor';
import { requireRole } from '@/lib/auth/require-role';
import { listBlogTerms } from '@/lib/data/blog';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function NewAdminBlogPostPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms.blog');
  const terms = await listBlogTerms();

  return (
    <div className="admin-management-signal blog-management-workspace">
      <div className="blog-management-heading">
        <p className="blog-management-eyebrow">{t('eyebrow')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('newTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('newDescription')}</p>
      </div>
      <BlogEditor post={null} terms={terms} />
    </div>
  );
}
