import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OtpForm } from '@/components/auth/OtpForm';
import { maskEmailAddress } from '@/components/auth/auth-form-state';
import { isAcceptedEmailContext } from '@/components/auth/auth-recovery-state';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recovery.metadata.otp');
  return { title: t('title'), description: t('description'), referrer: 'no-referrer' };
}

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const t = await getTranslations('auth');
  const emailContext = typeof email === 'string' && isAcceptedEmailContext(email) ? email : null;

  return (
    <div className="space-y-6">
      <header className="auth-card__head">
        <span className="eyebrow">{t('recovery.eyebrow')}</span>
        <h1>{t('recovery.otp.title')}</h1>
        <p>
          {emailContext
            ? t('recovery.otp.sentTo', { email: maskEmailAddress(emailContext) })
            : t('recovery.otp.missingContext')}
        </p>
      </header>
      {emailContext ? <OtpForm email={emailContext} /> : <OtpForm contextState="missing" />}
    </div>
  );
}
