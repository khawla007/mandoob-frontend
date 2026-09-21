import { notFound } from 'next/navigation';
import { requireAccountUser } from '@/lib/auth/require-account-user';
import { SessionsTab } from '@/components/account/SessionsTab';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const session = await requireAccountUser();
  if (session.role !== 'super_admin' && session.role !== 'pro') notFound();
  return <SessionsTab />;
}
