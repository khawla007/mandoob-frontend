'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function UsersError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('admin.user.proRegistry');
  return (
    <Alert variant="destructive">
      <AlertTitle>{t('errorTitle')}</AlertTitle>
      <AlertDescription className="space-y-4">
        <p>{t('errorDescription')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => reset()} className="min-h-11">
            {t('retry')}
          </Button>
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/admin/users?role=pro">{t('backToRegistry')}</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
