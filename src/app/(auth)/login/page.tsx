import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('signIn')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('welcomeBack')}</p>
      </div>
      <LoginForm />
      <div className="flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          {t('forgotPassword')}
        </Link>
        <Link href="/register" className="font-medium underline-offset-4 hover:underline">
          {t('createAccount')}
        </Link>
      </div>
    </div>
  );
}
