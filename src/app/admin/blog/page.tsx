import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BlogPostsTable } from '@/components/blog/BlogPostsTable';
import { requireRole } from '@/lib/auth/require-role';
import { listAdminBlogPosts } from '@/lib/data/blog';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

const POSTS_PER_PAGE = 8;

type SearchParams = Record<string, string | string[] | undefined>;

function readPage(searchParams: SearchParams): number {
  const raw = searchParams.page;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page: number): string {
  return page <= 1 ? '/admin/blog' : `/admin/blog?page=${page}`;
}

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.cms');
  const sp = await searchParams;
  const posts = await listAdminBlogPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
  const currentPage = Math.min(readPage(sp), totalPages);
  const start = (currentPage - 1) * POSTS_PER_PAGE;
  const paginatedPosts = posts.slice(start, start + POSTS_PER_PAGE);

  return (
    <div className="admin-management-signal blog-management-workspace">
      <div className="blog-management-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="blog-management-eyebrow">{t('blog.eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{t('blog.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('blog.description')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">{t('blog.new')}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('blog.posts')}</CardTitle>
          <CardDescription>
            {t('blog.total', { count: posts.length, perPage: POSTS_PER_PAGE })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">{t('blog.empty')}</p>
          ) : (
            <>
              <div className="border-border/60 overflow-hidden rounded-lg border">
                <BlogPostsTable posts={paginatedPosts} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                  {t('showing', {
                    from: start + 1,
                    to: Math.min(start + POSTS_PER_PAGE, posts.length),
                    total: posts.length,
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentPage > 1 ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(currentPage - 1)}>
                        <ChevronLeft className="size-3.5" />
                        {t('previous')}
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <ChevronLeft className="size-3.5" />
                      {t('previous')}
                    </Button>
                  )}
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                    <Button
                      key={page}
                      asChild={page !== currentPage}
                      variant={page === currentPage ? 'default' : 'outline'}
                      size="icon-sm"
                      aria-label={t('pageNumber', { page })}
                    >
                      {page === currentPage ? (
                        <span>{page}</span>
                      ) : (
                        <Link href={pageHref(page)}>{page}</Link>
                      )}
                    </Button>
                  ))}
                  {currentPage < totalPages ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={pageHref(currentPage + 1)}>
                        {t('next')}
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      {t('next')}
                      <ChevronRight className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
