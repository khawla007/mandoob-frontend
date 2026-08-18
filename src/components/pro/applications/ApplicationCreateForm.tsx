'use client';

import { useActionState } from 'react';
import type { ApplicationActionResult } from '@/app/(tenant)/t/[tenant]/(pro)/applications/actions';

type Option = { id: string; name: string };
type CreateState = ApplicationActionResult<{ id: string }> | null;

export type ApplicationCreateFormLabels = {
  title: string;
  serviceType: string;
  priority: string;
  priorities: Record<'low' | 'normal' | 'high' | 'urgent', string>;
  owner: string;
  unassigned: string;
  dueAt: string;
  slaDueAt: string;
  submit: string;
  pending: string;
  success: string;
};

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2';

export function ApplicationCreateForm({
  action,
  owners,
  labels,
}: {
  action: (previous: CreateState, formData: FormData) => Promise<CreateState>;
  owners: Option[];
  labels: ApplicationCreateFormLabels;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid gap-4 border-t p-5 md:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.title}
        <input name="title" required minLength={2} maxLength={160} className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.serviceType}
        <input name="service_type" required minLength={2} maxLength={80} className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.priority}
        <select name="priority" defaultValue="normal" className={fieldClass}>
          {(['low', 'normal', 'high', 'urgent'] as const).map((priority) => (
            <option key={priority} value={priority}>
              {labels.priorities[priority]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.owner}
        <select name="assigned_to" className={fieldClass}>
          <option value="">{labels.unassigned}</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.dueAt}
        <input type="datetime-local" name="due_at" className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {labels.slaDueAt}
        <input type="datetime-local" name="sla_due_at" className={fieldClass} />
      </label>
      <div className="flex items-end gap-3 md:col-span-2 md:justify-end">
        {state ? (
          <p
            role={state.ok ? 'status' : 'alert'}
            aria-live="polite"
            className={state.ok ? 'text-sm text-green-700' : 'text-destructive text-sm'}
          >
            {state.ok ? labels.success : state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring h-9 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? labels.pending : labels.submit}
        </button>
      </div>
    </form>
  );
}
