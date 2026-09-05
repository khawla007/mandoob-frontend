import { Layers3 } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function DocumentBatchRequestUnavailable({
  labels,
}: {
  labels: { title: string; description: string };
}) {
  return (
    <div className="grid justify-items-end gap-1 text-end">
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled
        aria-describedby="batch-request-status"
      >
        <Layers3 aria-hidden="true" />
        {labels.title}
      </Button>
      <p id="batch-request-status" className="text-muted-foreground max-w-64 text-xs">
        {labels.description}
      </p>
    </div>
  );
}
