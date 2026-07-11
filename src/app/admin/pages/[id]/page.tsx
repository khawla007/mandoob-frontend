import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageEditor } from '@/components/pages/PageEditor';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/require-role';
import { getAdminCmsPage } from '@/lib/data/pages';

export const dynamic = 'force-dynamic';
export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('super_admin', 'admin');
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const page = await getAdminCmsPage(parsed.data);
  if (!page) notFound();
  return <div className="space-y-6"><header><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link href="/admin/pages"><ArrowLeft />Page library</Link></Button><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Editing page</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{page.title}</h1><p className="mt-1 font-mono text-xs text-muted-foreground">/{page.slug}</p></header><PageEditor page={page} /></div>;
}
