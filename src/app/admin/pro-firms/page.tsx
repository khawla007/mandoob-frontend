import { redirect } from 'next/navigation';

export default function LegacyProFirmsPage(): never {
  redirect('/admin/companies');
}
