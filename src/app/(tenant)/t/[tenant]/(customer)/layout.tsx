import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  await requireRole('customer');
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="text-muted-foreground mb-8 text-sm">Customer portal</div>
      {children}
    </div>
  );
}
