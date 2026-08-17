import { BadgeCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ComingSoon } from '@/components/pro/ComingSoon';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';

export const dynamic = 'force-dynamic';

export default async function ProEmployeesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireProTenantRouteAccess(slug);
  const t = await getTranslations('pro');
  return (
    <ComingSoon
      title={t('employees')}
      subtitle="Employee management ships in a later step."
      icon={<BadgeCheck className="size-8 opacity-60" />}
    />
  );
}
