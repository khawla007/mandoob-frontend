import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { OtpForm } from '@/components/auth/OtpForm';

export const dynamic = 'force-dynamic';

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email) redirect('/register');

  const t = await getTranslations('auth');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('enterCode')}</h1>
        <p className="text-muted-foreground text-sm">{t('codeSentTo', { email })}</p>
      </div>
      <OtpForm email={email} />
    </div>
  );
}
