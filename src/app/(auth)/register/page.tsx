import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  return (
    <>
      <header className="auth-card__head">
        <span className="eyebrow">Mandoob · Account</span>
        <h1>{t('createAccount')}</h1>
        <p>{t('startRegistration')}</p>
      </header>

      <RegisterForm />

      <div className="auth-card__foot">
        <span>{t('alreadyHaveAccount')}</span>
        <Link href="/login" className="btn btn--sm btn--accent-outline">
          {t('signIn')}
        </Link>
      </div>
    </>
  );
}
