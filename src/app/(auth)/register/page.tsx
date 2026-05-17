import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('createAccount')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('startRegistration')}</p>
      </div>
      <RegisterForm />
      <p className="text-muted-foreground text-center text-sm">
        {t('alreadyHaveAccount')}{' '}
        <Link
          href="/login"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
