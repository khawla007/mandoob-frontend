import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';

export default async function AdminNotFound() {
  const t = await getTranslations('operations');

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t('unavailableTitle')}</h1>
      <p className="text-muted-foreground text-sm">{t('boundariesDescription')}</p>
      <Button asChild variant="outline">
        <Link href="/admin">Mandoob</Link>
      </Button>
    </div>
  );
}
