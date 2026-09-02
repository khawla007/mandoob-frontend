'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Result = { ok: true; data: { id: string } } | { ok: false; error: string; code: string };
type Action = (state: Result | null, formData: FormData) => Promise<Result>;

export function EmployeeImportForm({
  action,
  jobPath,
  labels,
}: {
  action: Action;
  jobPath: string;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok) router.push(`${jobPath}/${state.data.id}`);
  }, [jobPath, router, state]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="file">{labels.file}</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
      </div>
      <p className="text-muted-foreground text-sm">{labels.guidance}</p>
      {state && !state.ok ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {labels.resultError}
        </p>
      ) : null}
      {state?.ok ? (
        <p aria-live="polite" className="text-sm">
          {labels.resultReady}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 sm:min-h-9">
        <Upload className="size-4" aria-hidden="true" />
        {pending ? labels.pending : labels.upload}
      </Button>
    </form>
  );
}
