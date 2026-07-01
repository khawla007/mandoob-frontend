import Link from 'next/link';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteBlogPostAction } from '@/app/admin/blog/actions';
import { formatAdminDateTime } from '@/lib/format/date';
import type { BlogPost } from '@/lib/data/blog';

async function deletePost(id: string): Promise<void> {
  'use server';
  await deleteBlogPostAction(id);
}

function statusVariant(status: BlogPost['status']): 'default' | 'secondary' | 'outline' {
  if (status === 'published') return 'default';
  if (status === 'scheduled') return 'secondary';
  return 'outline';
}

export function BlogPostsTable({ posts }: { posts: BlogPost[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
          <TableRow key={post.id}>
            <TableCell>
              <div className="max-w-80 truncate font-medium">{post.title}</div>
              {post.excerpt ? (
                <div className="text-muted-foreground mt-1 max-w-80 truncate text-xs">
                  {post.excerpt}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">{post.slug}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(post.status)} className="capitalize">
                {post.status}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
              {post.publishedAt ? formatAdminDateTime(post.publishedAt) : '—'}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1.5">
                <Button asChild size="icon-sm" variant="ghost" aria-label={`Edit ${post.title}`}>
                  <Link href={`/admin/blog/${post.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                {post.status === 'published' ? (
                  <Button asChild size="icon-sm" variant="ghost" aria-label={`View ${post.title}`}>
                    <Link href={`/blog/${post.slug}`} target="_blank">
                      <Eye />
                    </Link>
                  </Button>
                ) : null}
                <form action={deletePost.bind(null, post.id)}>
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="destructive"
                    aria-label={`Delete ${post.title}`}
                  >
                    <Trash2 />
                  </Button>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
