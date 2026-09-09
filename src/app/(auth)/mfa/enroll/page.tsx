import { getTranslations } from 'next-intl/server';
import { MfaEnrollCard } from '@/components/auth/MfaEnrollCard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';
import { redirect } from 'next/navigation';

export default async function MfaEnrollPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const [t, supabase] = await Promise.all([getTranslations('auth'), createSupabaseServerClient()]);
  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  const enrollmentUnavailable = Boolean(factorError) || !factors;
  const challengeRequired =
    !enrollmentUnavailable &&
    (factors?.totp?.some((factor) => factor.status === 'verified') ?? false);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('enableTwoFactor')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('mfaEnrollmentIntro')}</p>
      </div>
      <MfaEnrollCard
        challengeRequired={challengeRequired}
        enrollmentUnavailable={enrollmentUnavailable}
      />
    </div>
  );
}
