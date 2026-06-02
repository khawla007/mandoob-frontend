'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { toggleCostDataAction } from '@/app/admin/cost-data/actions';

export function CostDataStatusButton({ id, active }: { id: string; active: boolean }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await toggleCostDataAction({ id, active: !active });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={onClick}>
        {active ? t('costData.status.deactivate') : t('costData.status.reactivate')}
      </Button>
      {message ? <p className="text-destructive max-w-40 text-right text-xs">{message}</p> : null}
    </div>
  );
}
