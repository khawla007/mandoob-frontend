import { getTranslations } from 'next-intl/server';

export default async function SettingsLoading() {
  const t = await getTranslations('pro.settings');
  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-6"
      aria-busy="true"
      aria-label={t('loading.settings')}
    >
      <div className="bg-muted h-20 animate-pulse rounded-xl" />
      <div className="bg-muted h-28 animate-pulse rounded-xl" />
      <div className="bg-muted h-72 animate-pulse rounded-xl" />
    </div>
  );
}
