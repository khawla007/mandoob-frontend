import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthProviders } from '@/components/auth/AuthProviders';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.metadata.login');
  return { title: t('title'), description: t('description') };
}

export default async function LoginPage() {
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
        <span className="eyebrow">{t('accountEyebrow')}</span>
        <h1>{t('signIn')}</h1>
        <p>{t('welcomeBack')}</p>
      </header>

      <LoginForm />
      <AuthProviders labels={providerLabels} />

      <div className="auth-card__foot">
        <span>{t('newToMandoob')}</span>
        <Link href="/register" className="btn btn--sm btn--accent-outline">
          {t('createAccount')}
        </Link>
      </div>
    </>
  );
}
