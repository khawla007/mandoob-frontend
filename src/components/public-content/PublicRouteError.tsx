'use client';

import { useTranslations } from 'next-intl';

export function PublicRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('publicPolish.error');

  return (
    <section className="public-content-state" aria-labelledby="route-error-h">
      <div className="public-content-state__inner container">
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1 id="route-error-h">{t('title')}</h1>
        <p>{t('description')}</p>
        <button className="btn btn--accent" type="button" onClick={() => reset()}>
          {t('retry')}
        </button>
      </div>
    </section>
  );
}
