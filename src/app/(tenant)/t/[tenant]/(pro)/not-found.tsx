import { getTranslations } from 'next-intl/server';

export default async function ProNotFound() {
  const t = await getTranslations('operations');

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('unavailableTitle')}</h1>
      <p className="text-muted-foreground text-sm">{t('boundariesDescription')}</p>
    </div>
  );
}
