import { BadgeCheck } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default function ProEmployeesPage() {
  return (
    <ComingSoon
      title="Employees"
      subtitle="Employee management ships in a later step."
      icon={<BadgeCheck className="size-8 opacity-60" />}
    />
  );
}
