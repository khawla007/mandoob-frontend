import { requireRole } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  await requireRole('employee');
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-muted-foreground mb-8 text-sm">Employee portal</div>
      {children}
    </div>
  );
}
