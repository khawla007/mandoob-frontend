import { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/require-user';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { AccountTabs } from '@/components/account/AccountTabs';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const t = await getTranslations('account');
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </header>
        <AccountTabs role={session.role ?? 'customer'} />
        <main className="pt-2">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
