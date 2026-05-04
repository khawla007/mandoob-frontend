import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SettingsReadOnlyNotice() {
  return (
    <Alert>
      <AlertTitle>Read-only view</AlertTitle>
      <AlertDescription>
        Only firm admins can change these settings. Ask your firm admin to make edits, or to promote
        you to admin from the Team page.
      </AlertDescription>
    </Alert>
  );
}
