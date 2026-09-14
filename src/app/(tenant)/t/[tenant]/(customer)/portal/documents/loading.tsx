import { getTranslations } from 'next-intl/server';

export default async function CustomerDocumentCenterLoading() {
  const t = await getTranslations('customer.documentCenter');
  return (
    <div className="document-center grid gap-4" role="status" aria-busy="true">
      <div className="bg-muted h-20 animate-pulse rounded-2xl" />
      <div className="document-center__summary-grid grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-muted h-28 animate-pulse rounded-2xl" />
        ))}
      </div>
      <div className="bg-muted h-52 animate-pulse rounded-2xl" />
      <span className="sr-only">{t('loading')}</span>
    </div>
  );
}
