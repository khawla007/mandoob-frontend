import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function TenantSuspendedBanner({ status }: { status: string }) {
  const label = status === 'pending' ? 'Pending approval' : 'Suspended';
  const message =
    status === 'pending'
      ? 'This workspace is awaiting admin approval. Editing is disabled until your account is activated.'
      : 'This workspace is suspended. Editing is disabled. Contact support to restore access.';
  return (
    <Alert variant="destructive" className="mx-6 mt-6 md:mx-8">
      <AlertTriangle className="size-4" />
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
