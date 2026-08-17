import { notFound, redirect } from 'next/navigation';
import { isUuid } from '@/lib/util/uuid';

export default async function LegacyProFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`/admin/companies?tenant=${encodeURIComponent(id)}`);
}
