import { FileText } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default function EmployeeDocumentsPage() {
  return (
    <ComingSoon
      title="Documents"
      subtitle="Your documents ship in a later step."
      icon={<FileText className="size-8 opacity-60" />}
    />
  );
}
