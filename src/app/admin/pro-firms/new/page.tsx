import { redirect } from 'next/navigation';

export default function LegacyNewProFirmPage(): never {
  redirect('/admin/companies/new');
}
