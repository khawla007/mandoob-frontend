import { getTranslations } from 'next-intl/server';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';

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
