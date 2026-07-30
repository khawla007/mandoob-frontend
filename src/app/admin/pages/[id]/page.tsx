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
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!parsed.success) notFound();
  const page = await getAdminCmsPage(parsed.data);
  if (!page) notFound();
  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
          <Link href="/admin/pages">
            <ArrowLeft />
            Page library
          </Link>
        </Button>
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Editing page
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{page.title}</h1>
        <p className="text-muted-foreground mt-1 font-mono text-xs">/{page.slug}</p>
      </header>
      <PageEditor page={page} />
    </div>
  );
}
