import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="text-muted-foreground font-mono text-xs tracking-[0.12em] uppercase">
          Mandoob · Account
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{t('createAccount')}</h1>
        <p className="text-muted-foreground text-sm">{t('startRegistration')}</p>
      </div>
      <RegisterForm />
      <p className="text-muted-foreground text-center text-sm">
        {t('alreadyHaveAccount')}{' '}
        <Link
          href="/login"
          className="font-medium text-[#FF5722] underline-offset-4 hover:underline"
        >
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
