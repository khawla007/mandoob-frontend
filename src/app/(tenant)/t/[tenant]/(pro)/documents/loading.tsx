import { useTranslations } from 'next-intl';

import { DocumentCenterLoadingView } from '@/components/pro/documents/DocumentCenterLoadingView';

export default function DocumentCenterLoading() {
  const t = useTranslations('proDocumentCenter');

  return <DocumentCenterLoadingView label={t('loading.label')} />;
}
