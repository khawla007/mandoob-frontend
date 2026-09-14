import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import {
  isValidRecoveryContextValue,
  RECOVERY_CONTEXT_COOKIE_NAME,
} from '@/lib/auth/recovery-context';
import { buildAuthMetadata } from '@/lib/public-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recovery.metadata.reset');
  return buildAuthMetadata({
    title: t('title'),
    description: t('description'),
    canonical: '/reset-password',
    referrer: 'no-referrer',
  });
}

export default async function ResetPasswordPage() {
  const t = await getTranslations('auth');
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const marker = (await cookies()).get(RECOVERY_CONTEXT_COOKIE_NAME)?.value;
  const recoveryState =
    data.user && isValidRecoveryContextValue(marker, data.user.id, env.SUPABASE_SERVICE_ROLE_KEY)
      ? 'ready'
      : 'invalid';
  return (
    <div className="space-y-6">
      <header className="auth-card__head">
        <span className="eyebrow">{t('recovery.eyebrow')}</span>
        <h1>{t('recovery.reset.title')}</h1>
        <p>{t('recovery.reset.intro')}</p>
      </header>
      <ResetPasswordForm recoveryState={recoveryState} />
    </div>
  );
}
