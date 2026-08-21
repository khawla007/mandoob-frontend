import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function TenantSuspendedBanner({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const label = status === 'pending' ? 'Pending approval' : 'Suspended';
  const message =
    status === 'pending'
      ? 'This workspace is awaiting activation. Company setup remains available while operational editing is limited.'
      : 'This workspace is suspended. Editing is disabled. Contact support to restore access.';
  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="size-4" />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
