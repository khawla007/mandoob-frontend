import { useId } from 'react';

import { Button } from '@/components/ui/button';

export function AdminUnavailableAction({
  label,
  explanation,
}: {
  label: string;
  explanation: string;
}) {
  const explanationId = useId();

  return (
    <div className="space-y-2">
      <Button type="button" disabled aria-describedby={explanationId}>
        {label}
      </Button>
      <p id={explanationId} className="text-muted-foreground max-w-md text-xs leading-5">
        {explanation}
      </p>
    </div>
  );
}
