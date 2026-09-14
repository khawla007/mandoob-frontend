import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MfaEnrollCard } from '@/components/auth/MfaEnrollCard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';
import { buildAuthMetadata } from '@/lib/public-metadata';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa.enroll');
  return buildAuthMetadata({
    title: t('title'),
    description: t('intro'),
    canonical: '/mfa/enroll',
    referrer: 'no-referrer',
  });
}

export default async function MfaEnrollPage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const [t, tEnrollment, supabase] = await Promise.all([
    getTranslations('auth'),
    getTranslations('auth.mfa.enroll'),
    createSupabaseServerClient(),
  ]);
  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  const enrollmentUnavailable = Boolean(factorError) || !factors;
  const challengeRequired =
    !enrollmentUnavailable &&
    (factors?.totp?.some((factor) => factor.status === 'verified') ?? false);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{tEnrollment('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('mfaEnrollmentIntro')}</p>
      </div>
      <MfaEnrollCard
        challengeRequired={challengeRequired}
        enrollmentUnavailable={enrollmentUnavailable}
      />
    </div>
  );
}
