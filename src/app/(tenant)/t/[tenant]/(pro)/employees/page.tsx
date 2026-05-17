import { BadgeCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/pro/ComingSoon';

export const dynamic = 'force-dynamic';

export default async function ProEmployeesPage() {
  const t = await getTranslations('pro');
  return (
    <ComingSoon
      title={t('employees')}
      subtitle="Employee management ships in a later step."
      icon={<BadgeCheck className="size-8 opacity-60" />}
    />
  );
}
