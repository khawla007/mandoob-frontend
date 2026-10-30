'use client';

import { useActionState } from 'react';

import { Button } from '@/components/ui/button';

export type OperationalNotificationReadActionState = {
  status: 'idle' | 'success' | 'error';
};

type OperationalNotificationReadFormProps = {
  action: (
    previousState: OperationalNotificationReadActionState,
    formData: FormData,
  ) => Promise<OperationalNotificationReadActionState>;
  notificationId: string;
  operationId: string;
  read: boolean;
  actionLabel: string;
  pendingLabel: string;
  successLabel: string;
  errorLabel: string;
};

const initialState: OperationalNotificationReadActionState = { status: 'idle' };

export function OperationalNotificationReadForm({
  action,
  notificationId,
  operationId,
  read,
  actionLabel,
  pendingLabel,
  successLabel,
  errorLabel,
}: OperationalNotificationReadFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="ms-auto flex flex-col items-end gap-1">
      <input type="hidden" name="notificationId" value={notificationId} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="read" value={read ? 'false' : 'true'} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? pendingLabel : actionLabel}
      </Button>
      <span className="text-muted-foreground min-h-4 text-xs" aria-live="polite">
        {state.status === 'success' ? successLabel : state.status === 'error' ? errorLabel : null}
      </span>
    </form>
  );
}
