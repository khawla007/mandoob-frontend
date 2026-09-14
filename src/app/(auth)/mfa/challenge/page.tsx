import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';
import { mfaFactorDiscoveryCategory } from '@/components/auth/mfa-state';
import { requireUser } from '@/lib/auth/require-user';
import { buildAuthMetadata } from '@/lib/public-metadata';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa.challenge');
  return buildAuthMetadata({
    title: t('title'),
    description: t('intro'),
    canonical: '/mfa/challenge',
    referrer: 'no-referrer',
  });
}

export default async function MfaChallengePage() {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login');
    throw error;
  }
  const [t, supabase] = await Promise.all([
    getTranslations('auth.mfa.challenge'),
    createSupabaseServerClient(),
  ]);
  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  const factorId = factors?.totp.find((factor) => factor.status === 'verified')?.id ?? null;
  const discoveryError = factorError ? mfaFactorDiscoveryCategory(factorError) : null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('intro')}</p>
      </div>
      <MfaChallengeForm initialFactorId={factorId} initialDiscoveryError={discoveryError} />
    </div>
  );
}
