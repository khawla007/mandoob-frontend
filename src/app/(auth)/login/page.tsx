import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage() {
  const t = await getTranslations('auth');
  return (
    <>
      <header className="auth-card__head">
        <span className="eyebrow">Mandoob · Account</span>
        <h1>{t('signIn')}</h1>
        <p>{t('welcomeBack')}</p>
      </header>

      <LoginForm />

      <div className="auth-card__foot">
        <Link href="/forgot-password">{t('forgotPassword')}</Link>
        <Link href="/register" className="btn btn--sm btn--accent-outline">
          {t('createAccount')}
        </Link>
      </div>
    </>
  );
}
