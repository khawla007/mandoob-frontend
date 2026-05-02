import { Briefcase } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export default function ClientsPage() {
  return (
    <ComingSoon
      title="Clients"
      subtitle="Registrations, visas, Emirates IDs, license renewals per client."
      icon={<Briefcase className="size-6" />}
    />
  );
}
