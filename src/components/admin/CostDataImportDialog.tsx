'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { importCostDataCsvAction } from '@/app/admin/cost-data/actions';

export function CostDataImportDialog() {
  const t = useTranslations('admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await importCostDataCsvAction({ csv });
      if (!result.ok) {
        setMessage(`${result.code}: ${result.error}`);
        return;
      }
      setMessage(
        result.data.errors.length
          ? t('costData.import.insertedWithErrors', {
              inserted: result.data.inserted,
              failed: result.data.errors.length,
            })
          : t('costData.import.inserted', { inserted: result.data.inserted }),
      );
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('costData.import.trigger')}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('costData.import.title')}</DialogTitle>
          <DialogDescription>{t('costData.import.description')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {message ? (
            <Alert>
              <AlertTitle>{t('costData.import.resultTitle')}</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
          <Textarea
            className="min-h-72 font-mono text-xs"
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder="jurisdiction,authority,fee_type,label,amount_aed,currency,recurrence,..."
          />
          <DialogFooter>
            <Button type="submit" disabled={pending || !csv.trim()}>
              {pending ? t('costData.import.importing') : t('costData.import.importRows')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
