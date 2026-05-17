import { getTranslations } from 'next-intl/server';
import { MfaEnrollCard } from '@/components/auth/MfaEnrollCard';

export default async function MfaEnrollPage() {
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('enableTwoFactor')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('longCopy.scanQrIntro')}</p>
      </div>
      <MfaEnrollCard />
    </div>
  );
}
