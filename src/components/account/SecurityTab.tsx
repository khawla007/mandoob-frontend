import { getTranslations } from 'next-intl/server';
import { PasswordChangeForm } from './PasswordChangeForm';

export async function SecurityTab() {
  const t = await getTranslations('account');
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">{t('changePassword')}</h2>
      <PasswordChangeForm />
    </section>
  );
}
