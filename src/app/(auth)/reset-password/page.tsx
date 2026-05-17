import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('chooseNewPassword')}</h1>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
