import { BlogTaxonomyManager } from '@/components/blog/BlogTaxonomyManager';
import { requireRole } from '@/lib/auth/require-role';
import { listBlogTerms } from '@/lib/data/blog';

export const dynamic = 'force-dynamic';

export default async function AdminBlogCategoriesPage() {
  await requireRole('super_admin', 'admin');
  const terms = await listBlogTerms('category');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage blog categories used to group platform articles.
        </p>
      </div>
      <BlogTaxonomyManager kind="category" terms={terms} />
    </div>
  );
}
