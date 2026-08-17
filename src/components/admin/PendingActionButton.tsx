import { Button } from '@/components/ui/button';

export function PendingActionButton({
  pending,
  idleLabel,
  pendingLabel,
  destructive = false,
  completed = false,
}: {
  pending: boolean;
  idleLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  completed?: boolean;
}) {
  const disabled = pending || completed;

  return (
    <Button
      type="submit"
      variant={destructive ? 'destructive' : 'default'}
      disabled={disabled}
      aria-disabled={disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
