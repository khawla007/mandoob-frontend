import { getTranslations } from 'next-intl/server';
import { InviteAcceptForm } from '@/components/auth/InviteAcceptForm';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('auth');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('acceptInvitation')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('acceptInvitationIntro')}</p>
      </div>
      <InviteAcceptForm token={token} />
    </div>
  );
}
