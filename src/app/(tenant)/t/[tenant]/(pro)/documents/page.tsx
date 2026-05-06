import { FileText } from 'lucide-react';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default function ProDocumentsPage() {
  return (
    <ComingSoon
      title="Documents"
      subtitle="Document management ships in a later step."
      icon={<FileText className="size-8 opacity-60" />}
    />
  );
}
