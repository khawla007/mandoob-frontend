import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default async function ProDocumentsPage() {
  const t = await getTranslations('pro');
  return (
    <ComingSoon
      title={t('documents')}
      subtitle="Document management ships in a later step."
      icon={<FileText className="size-8 opacity-60" />}
    />
  );
}
