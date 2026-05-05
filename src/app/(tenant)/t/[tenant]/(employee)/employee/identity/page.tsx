import { IdCard } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default function EmployeeIdentityPage() {
  return (
    <ComingSoon
      title="Visa & Emirates ID"
      subtitle="Identity records ship in a later step."
      icon={<IdCard className="size-8 opacity-60" />}
    />
  );
}
