import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/require-role';

export const dynamic = 'force-dynamic';

export default async function TenantRoot() {
  const session = await requireSession();
  switch (session.role) {
    case 'pro':
      redirect('./dashboard');
    case 'customer':
      redirect('./portal');
    case 'employee':
      redirect('./employee/dashboard');
    case 'super_admin':
      return null; // super_admin sees tenant shell via impersonation (M8-future)
    default:
      redirect('/login');
  }
}
