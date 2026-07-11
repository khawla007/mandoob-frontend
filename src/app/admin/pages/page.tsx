import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PagesTable } from '@/components/pages/PagesTable';
import { clampAdminPage, pageHref } from '@/components/pages/admin-page-state';
import { requireRole } from '@/lib/auth/require-role';
import { listAdminCmsPages } from '@/lib/data/pages';

export const dynamic = 'force-dynamic';
type SearchParams = Record<string, string | string[] | undefined>;

export default async function AdminPagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole('super_admin', 'admin');
  const rawPage = (await searchParams).page;
  const rawValue = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const parsed = Number.parseInt(rawValue ?? '1', 10);
  const requestedPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  let result = await listAdminCmsPages({ page: requestedPage, pageSize: 8 });
  const currentPage = clampAdminPage(rawPage, result.total, result.pageSize);
  if (currentPage !== result.page) result = await listAdminCmsPages({ page: currentPage, pageSize: 8 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const start = (currentPage - 1) * result.pageSize;
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Content library</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Pages</h1><p className="mt-1 text-sm text-muted-foreground">Compose standalone editorial pages, hero treatments, and search metadata.</p></div><Button asChild><Link href="/admin/pages/new">New page</Link></Button></header>
    <Card><CardHeader><CardTitle>Page library</CardTitle><CardDescription>{result.total} total pages · 8 per page</CardDescription></CardHeader><CardContent className="space-y-4">{result.total === 0 ? <div className="rounded-lg border border-dashed py-12 text-center"><p className="font-medium">No pages yet</p><p className="mt-1 text-sm text-muted-foreground">Create the first page to begin the library.</p></div> : <><div className="overflow-x-auto rounded-lg border"><PagesTable pages={result.items} /></div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Showing {start + 1}–{Math.min(start + result.pageSize, result.total)} of {result.total}</p><nav aria-label="Page library pagination" className="flex gap-2"><Button asChild={currentPage > 1} variant="outline" size="sm" disabled={currentPage <= 1}>{currentPage > 1 ? <Link href={pageHref(currentPage - 1)}><ChevronLeft />Previous</Link> : <span><ChevronLeft />Previous</span>}</Button><span className="grid min-w-20 place-items-center text-sm tabular-nums">{currentPage} / {totalPages}</span><Button asChild={currentPage < totalPages} variant="outline" size="sm" disabled={currentPage >= totalPages}>{currentPage < totalPages ? <Link href={pageHref(currentPage + 1)}>Next<ChevronRight /></Link> : <span>Next<ChevronRight /></span>}</Button></nav></div></>}</CardContent></Card>
  </div>;
}
