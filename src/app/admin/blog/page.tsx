import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BlogPostsTable } from '@/components/blog/BlogPostsTable';
import { requireRole } from '@/lib/auth/require-role';
import { listAdminBlogPosts } from '@/lib/data/blog';

export const dynamic = 'force-dynamic';

export default async function AdminBlogPage() {
  await requireRole('super_admin', 'admin');
  const posts = await listAdminBlogPosts();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Blog</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage platform articles, publishing status, SEO, images, and galleries.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">New post</Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { href: '/admin/blog/categories', label: 'Categories' },
          { href: '/admin/blog/attributes', label: 'Attributes' },
          { href: '/admin/blog/tags', label: 'Tags' },
        ].map((item) => (
          <Button key={item.href} asChild variant="outline">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
          <CardDescription>{posts.length} total posts</CardDescription>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No blog posts yet.</p>
          ) : (
            <div className="border-border/60 overflow-hidden rounded-lg border">
              <BlogPostsTable posts={posts} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
