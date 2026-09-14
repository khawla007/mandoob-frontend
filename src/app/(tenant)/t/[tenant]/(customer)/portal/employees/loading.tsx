import { getTranslations } from 'next-intl/server';
export default async function EmployeeRegistryLoading() {
  const t = await getTranslations('customer.employeeRegistry');
  return (
    <div className="space-y-4" role="status">
      <div className="bg-muted h-16 animate-pulse rounded-lg" />
      <div className="bg-muted h-40 animate-pulse rounded-lg" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
