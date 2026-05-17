import { getTranslations } from 'next-intl/server';
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';

export default async function MfaChallengePage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('enterTwoFactorCode')}</h1>
      <MfaChallengeForm />
    </div>
  );
}
