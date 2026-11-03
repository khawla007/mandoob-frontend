import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { AuthProviders } from '@/components/auth/AuthProviders';
import { buildAuthMetadata } from '@/lib/public-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.metadata.register');
  return buildAuthMetadata({
    title: t('title'),
    description: t('description'),
    canonical: '/register',
  });
}

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  const providerLabels = {
    heading: t('providers.heading'),
    unavailableDescription: t('providers.unavailableDescription'),
    listLabel: t('providers.listLabel'),
    unavailable: t('providers.unavailable'),
    google: t('providers.google'),
    microsoft: t('providers.microsoft'),
    apple: t('providers.apple'),
    providerUnavailableLabel: (provider: string) =>
      t('providers.providerUnavailableLabel', { provider }),
  };
  return (
    <>
      <header className="auth-card__head">
        <h1>{t('registerTitle')}</h1>
        <p className="auth-card__switch">
          {t('alreadyHaveAccount')} <Link href="/login">{t('loginLink')}</Link>
        </p>
      </header>

      <RegisterForm />
      <AuthProviders labels={providerLabels} />
    </>
  );
}
