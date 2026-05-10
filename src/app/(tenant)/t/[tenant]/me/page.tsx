import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EmployeeMeAlias({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/t/${tenant}/employee/dashboard`);
}
