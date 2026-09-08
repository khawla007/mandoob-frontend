import { getTranslations } from 'next-intl/server';
import { MfaEnrollCard } from '@/components/auth/MfaEnrollCard';

export default async function MfaEnrollPage() {
  const t = await getTranslations('auth.mfa.enroll');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('intro')}</p>
      </div>
      <MfaEnrollCard />
    </div>
  );
}
