'use client';

import { useActionState, useState } from 'react';
import { Ban, CheckCircle2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Result = { ok: true; data: unknown } | { ok: false; error: string; code: string };
type Action = (state: Result | null, formData: FormData) => Promise<Result>;

function ActionFeedback({
  state,
  labels,
}: {
  state: Result | null;
  labels: Record<string, string>;
}) {
  if (!state) return null;
  return (
    <p
      aria-live="polite"
      className={state.ok ? 'text-sm text-[var(--signal-success)]' : 'text-destructive text-sm'}
    >
      {state.ok ? labels.success : labels.error}
    </p>
  );
}

export function BulkImportJobActions({
  status,
  canCancel,
  validateAction,
  executeAction,
  cancelAction,
  labels,
}: {
  status: string;
  canCancel: boolean;
  validateAction: Action;
  executeAction: Action;
  cancelAction: Action;
  labels: Record<string, string>;
}) {
  const [validation, validate, validating] = useActionState(validateAction, null);
  const [execution, execute, executing] = useActionState(executeAction, null);
  const [cancellation, cancel, cancelling] = useActionState(cancelAction, null);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === 'uploaded' ? (
        <form action={validate} className="flex items-center gap-2">
          <Button disabled={validating} type="submit">
            <CheckCircle2 className="me-2 size-4" aria-hidden />
            {validating ? labels.pending : labels.validate}
          </Button>
          <ActionFeedback state={validation} labels={labels} />
        </form>
      ) : null}
      {status === 'validated' ? (
        <form action={execute} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input name="skip_existing" type="checkbox" defaultChecked className="size-4" />
            <span>{labels.skipExisting}</span>
          </label>
          <Button disabled={executing} type="submit">
            <Play className="me-2 size-4" aria-hidden />
            {executing ? labels.pending : labels.confirm}
          </Button>
          <ActionFeedback state={execution} labels={labels} />
        </form>
      ) : null}
      {canCancel ? (
        <>
          <Button
            disabled={cancelling}
            type="button"
            variant="outline"
            onClick={() => setCancelConfirmationOpen(true)}
          >
            <Ban className="me-2 size-4" aria-hidden />
            {cancelling ? labels.pending : labels.cancel}
          </Button>
          <Dialog open={cancelConfirmationOpen} onOpenChange={setCancelConfirmationOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{labels.cancelTitle}</DialogTitle>
                <DialogDescription>{labels.cancelPrompt}</DialogDescription>
              </DialogHeader>
              <form action={cancel}>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelConfirmationOpen(false)}
                    disabled={cancelling}
                  >
                    {labels.keep}
                  </Button>
                  <Button type="submit" variant="destructive" disabled={cancelling}>
                    {cancelling ? labels.pending : labels.confirmCancel}
                  </Button>
                </DialogFooter>
              </form>
              <ActionFeedback state={cancellation} labels={labels} />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
      {status === 'importing' ? (
        <p className="text-muted-foreground text-sm">{labels.cannotCancel}</p>
      ) : null}
    </div>
  );
}
