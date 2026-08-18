import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SettingsReadOnlyNotice() {
  return (
    <Alert>
      <AlertTitle>Read-only view</AlertTitle>
      <AlertDescription>
        Only platform administrators can change these company settings. Contact Mandoob support if
        an update is required.
      </AlertDescription>
    </Alert>
  );
}
