import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InviteAcceptForm } from '@/components/auth/InviteAcceptForm';
import { isAcceptedInviteToken } from '@/components/auth/auth-recovery-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recovery.metadata.invite');
  return { title: t('title'), description: t('description'), referrer: 'no-referrer' };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('auth');
  const tokenState = isAcceptedInviteToken(token) ? 'ready' : 'invalid';
  return (
    <div className="space-y-6">
      <header className="auth-card__head">
        <span className="eyebrow">{t('recovery.eyebrow')}</span>
        <h1>{t('recovery.invite.title')}</h1>
        <p>{t('recovery.invite.intro')}</p>
      </header>
      <InviteAcceptForm token={token} tokenState={tokenState} />
    </div>
  );
}
