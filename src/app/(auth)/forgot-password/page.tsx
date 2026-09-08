import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { buildAuthMetadata } from '@/lib/public-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recovery.metadata.forgot');
  return buildAuthMetadata({
    title: t('title'),
    description: t('description'),
    canonical: '/forgot-password',
  });
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
