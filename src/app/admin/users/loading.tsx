import { Skeleton } from '@/components/ui/skeleton';
import { getTranslations } from 'next-intl/server';

export default async function UsersLoading() {
  const t = await getTranslations('admin.user.proRegistry');
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-label={t('loading')}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[25rem] w-full" />
    </div>
  );
}
