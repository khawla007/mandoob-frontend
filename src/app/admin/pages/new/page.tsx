import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageEditor } from '@/components/pages/PageEditor';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';
export default async function NewAdminPage() {
  await requireRole('super_admin', 'admin');
  return <div className="space-y-6"><header><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link href="/admin/pages"><ArrowLeft />Page library</Link></Button><h1 className="text-2xl font-semibold tracking-tight">New page</h1><p className="mt-1 text-sm text-muted-foreground">Build a focused, reusable platform page.</p></header><PageEditor page={null} /></div>;
}
