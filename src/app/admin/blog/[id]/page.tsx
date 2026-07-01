import { notFound } from 'next/navigation';
import { BlogEditor } from '@/components/blog/BlogEditor';
import { requireRole } from '@/lib/auth/require-role';
import { getAdminBlogPost, listBlogTerms } from '@/lib/data/blog';

export const dynamic = 'force-dynamic';

export default async function EditAdminBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('super_admin', 'admin');
  const { id } = await params;
  const [post, terms] = await Promise.all([getAdminBlogPost(id), listBlogTerms()]);
  if (!post) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit blog post</h1>
        <p className="text-muted-foreground mt-1 text-sm">{post.title}</p>
      </div>
      <BlogEditor post={post} terms={terms} />
    </div>
  );
}
