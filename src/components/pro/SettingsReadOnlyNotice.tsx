import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getTranslations } from 'next-intl/server';

export async function SettingsReadOnlyNotice() {
  const t = await getTranslations('pro.settings.readOnly');
  return (
    <Alert>
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('description')}</AlertDescription>
    </Alert>
  );
}
