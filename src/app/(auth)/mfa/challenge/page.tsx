import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';
import { buildAuthMetadata } from '@/lib/public-metadata';

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
  const t = await getTranslations('auth.mfa.challenge');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('intro')}</p>
      </div>
      <MfaChallengeForm />
    </div>
  );
}
