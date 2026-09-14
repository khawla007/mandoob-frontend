import Link from 'next/link';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteBlogPostAction } from '@/app/admin/blog/actions';
import { formatDateTime } from '@/lib/i18n/format';
import type { BlogPost } from '@/lib/data/blog';
import { getLocale, getTranslations } from 'next-intl/server';

async function deletePost(id: string): Promise<void> {
  'use server';
  await deleteBlogPostAction(id);
}

function statusVariant(status: BlogPost['status']): 'default' | 'secondary' | 'outline' {
  if (status === 'published') return 'default';
  if (status === 'scheduled') return 'secondary';
  return 'outline';
}

export async function BlogPostsTable({ posts }: { posts: BlogPost[] }) {
  const [t, locale] = await Promise.all([getTranslations('admin.cms.blog.table'), getLocale()]);
  return (
    <Table>
      <TableCaption className="sr-only">{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t('title')}</TableHead>
          <TableHead>{t('slug')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('published')}</TableHead>
          <TableHead className="text-right">{t('actions')}</TableHead>
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
                {t(`statuses.${post.status}`)}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs tabular-nums">
              {post.publishedAt ? formatDateTime(post.publishedAt, locale) : '—'}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1.5">
                <Button
                  asChild
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('edit', { title: post.title })}
                >
                  <Link href={`/admin/blog/${post.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                {post.status === 'published' ? (
                  <Button
                    asChild
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('view', { title: post.title })}
                  >
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
                    aria-label={t('delete', { title: post.title })}
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
