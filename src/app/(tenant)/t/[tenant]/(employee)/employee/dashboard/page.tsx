import { LayoutDashboard } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default function EmployeeDashboardPage() {
  return (
    <ComingSoon
      title="My dashboard"
      subtitle="Your records and tasks summary will live here."
      icon={<LayoutDashboard className="size-8 opacity-60" />}
    />
  );
}
