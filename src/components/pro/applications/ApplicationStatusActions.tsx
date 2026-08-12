'use client';

import { useActionState } from 'react';
import type { ApplicationActionResult } from '@/app/(tenant)/t/[tenant]/(pro)/applications/actions';

type UpdateState = ApplicationActionResult<void> | null;

export function ApplicationStatusActions({
  action,
  labels,
}: {
  action: (previous: UpdateState, formData: FormData) => Promise<UpdateState>;
  labels: { complete: string; cancel: string; pending: string; success: string };
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
        <button
          type="submit"
          name="status"
          value="cancelled"
          disabled={pending}
          className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive rounded-md px-2.5 py-1.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {labels.cancel}
        </button>
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
