'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
      const suffix = result.data.errors.length ? `, ${result.data.errors.length} failed` : '';
      setMessage(`Inserted ${result.data.inserted}${suffix}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import cost data</DialogTitle>
          <DialogDescription>Paste CSV exported from this page, then import validated rows.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {message ? (
            <Alert>
              <AlertTitle>Import result</AlertTitle>
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
              {pending ? 'Importing...' : 'Import rows'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
