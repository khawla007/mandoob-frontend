import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="text-muted-foreground font-mono text-xs tracking-[0.12em] uppercase">
          Mandoob · Account
        </span>
        <h1 className="text-3xl font-bold tracking-tight">{t('signIn')}</h1>
        <p className="text-muted-foreground text-sm">{t('welcomeBack')}</p>
      </div>
      <LoginForm />
      <div className="flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {t('forgotPassword')}
        </Link>
        <Link
          href="/register"
          className="font-medium text-[#FF5722] underline-offset-4 hover:underline"
        >
          {t('createAccount')}
        </Link>
      </div>
    </div>
  );
}
