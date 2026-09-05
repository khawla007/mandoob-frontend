'use client';

import { useActionState } from 'react';
import type { ApplicationActionResult } from '@/app/(tenant)/t/[tenant]/(pro)/applications/actions';

type UpdateState = ApplicationActionResult<void> | null;

export function ApplicationStatusActions({
  action,
  labels,
}: {
  action: (previous: UpdateState, formData: FormData) => Promise<UpdateState>;
  labels: {
    complete: string;
    cancel: string;
    cancelConfirm: string;
    pending: string;
    success: string;
  };
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <div className="flex justify-end gap-2">
        <button
          type="submit"
          name="status"
          value="completed"
          disabled={pending}
          className="border-input bg-background hover:bg-muted focus-visible:ring-ring rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? labels.pending : labels.complete}
        </button>
        <details className="relative">
          <summary
            aria-disabled={pending}
            className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive cursor-pointer list-none rounded-md px-2.5 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {labels.cancel}
          </summary>
          <button
            type="submit"
            name="status"
            value="cancelled"
            disabled={pending}
            className="bg-destructive text-destructive-foreground focus-visible:ring-destructive mt-2 rounded-md px-2.5 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? labels.pending : labels.cancelConfirm}
          </button>
        </details>
      </div>
      {state ? (
        <span
          role={state.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={state.ok ? 'text-xs text-green-700' : 'text-destructive text-xs'}
        >
          {state.ok ? labels.success : state.error}
        </span>
      ) : null}
    </form>
  );
}
