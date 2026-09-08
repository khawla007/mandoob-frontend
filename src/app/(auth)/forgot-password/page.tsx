import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recovery.metadata.forgot');
  return { title: t('title'), description: t('description') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <header className="auth-card__head">
        <span className="eyebrow">{t('recovery.eyebrow')}</span>
        <h1>{t('recovery.forgot.title')}</h1>
        <p>{t('recovery.forgot.intro')}</p>
      </header>
      <ForgotPasswordForm />
    </div>
  );
}
