'use client';

import { useTranslations } from 'next-intl';

export function DashboardSkipLink() {
  const t = useTranslations('shell');
  return (
    <a href="#main-content" className="dashboard-skip-link">
      {t('skipToContent')}
    </a>
  );
}
