import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('resetPassword')}</h1>
      <p className="text-sm text-zinc-500">{t('resetPasswordIntro')}</p>
      <ForgotPasswordForm />
    </div>
  );
}
