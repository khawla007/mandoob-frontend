import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-user';
import { SessionsTab } from '@/components/account/SessionsTab';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const session = await requireUser();
  if (session.role !== 'super_admin' && session.role !== 'pro') notFound();
  return <SessionsTab />;
}
