import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-user';
import { readSelfPro, readSelfCustomer, readSelfEmployee } from '@/lib/data/account-self';
import { RoleProForm } from '@/components/account/RoleProForm';
import { RoleCustomerForm } from '@/components/account/RoleCustomerForm';
import { RoleEmployeeForm } from '@/components/account/RoleEmployeeForm';

export const dynamic = 'force-dynamic';

export default async function RolePage() {
  const session = await requireUser();
  if (session.role === 'pro') {
    const data = await readSelfPro();
    return <RoleProForm initial={data} />;
  }
  if (session.role === 'customer') {
    const data = await readSelfCustomer();
    return <RoleCustomerForm initial={data} />;
  }
  if (session.role === 'employee') {
    const data = await readSelfEmployee();
    return <RoleEmployeeForm initial={data} />;
  }
  notFound();
}
