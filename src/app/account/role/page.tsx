import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-user';
import { requireAal2 } from '@/lib/auth/require-role';
import { requireLiveProAccount } from '@/app/api/v1/_shared/pro-lifecycle-routes';
import {
  readSelfPro,
  readSelfCustomer,
  readSelfEmployee,
  readSelfProCredentialSnapshot,
} from '@/lib/data/account-self';
import { RoleProForm } from '@/components/account/RoleProForm';
import { RoleCustomerForm } from '@/components/account/RoleCustomerForm';
import { RoleEmployeeForm } from '@/components/account/RoleEmployeeForm';
import { ProCredentialPanel } from '@/components/account/ProCredentialPanel';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function RolePage() {
  const authSession = await requireUser();
  const currentRole = authSession.role;
  if (currentRole === 'pro') {
    let session;
    try {
      session = await requireLiveProAccount();
    } catch {
      notFound();
    }
    await requireAal2(session);
    const [profileResult, credentialResult] = await Promise.allSettled([
      readSelfPro(),
      readSelfProCredentialSnapshot(session.id),
    ]);
    if (profileResult.status !== 'fulfilled') throw profileResult.reason;
    const t = await getTranslations('account');
    return (
      <div className="space-y-8">
        <section className="space-y-4" aria-labelledby="pro-profile-heading">
          <h2 id="pro-profile-heading" className="text-lg font-semibold">
            {t('proProfileTitle')}
          </h2>
          <RoleProForm initial={profileResult.value} />
        </section>
        <ProCredentialPanel
          snapshot={credentialResult.status === 'fulfilled' ? credentialResult.value : null}
          unavailable={credentialResult.status !== 'fulfilled'}
        />
      </div>
    );
  }
  if (currentRole === 'customer') {
    const data = await readSelfCustomer();
    return <RoleCustomerForm initial={data} />;
  }
  if (currentRole === 'employee') {
    const data = await readSelfEmployee();
    return <RoleEmployeeForm initial={data} />;
  }
  notFound();
}
