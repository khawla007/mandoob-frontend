import { BlogEditor } from '@/components/blog/BlogEditor';
import { requireRole } from '@/lib/auth/require-role';
import { listBlogTerms } from '@/lib/data/blog';

export const dynamic = 'force-dynamic';

export default async function NewAdminBlogPostPage() {
  await requireRole('super_admin', 'admin');
  const terms = await listBlogTerms();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New blog post</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Draft, schedule, or publish a platform article.
        </p>
      </div>
      <BlogEditor post={null} terms={terms} />
    </div>
  );
}
