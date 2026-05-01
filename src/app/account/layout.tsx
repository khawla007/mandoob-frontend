import { ReactNode } from 'react';
import { requireUser } from '@/lib/auth/require-user';
import { AccountTabs } from '@/components/account/AccountTabs';

export const dynamic = 'force-dynamic';

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your profile, password, MFA, and active sessions.
        </p>
      </header>
      <AccountTabs role={session.role ?? 'customer'} />
      <main className="pt-2">{children}</main>
    </div>
  );
}
