import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ProLifecycleRecoveryPanel({
  title,
  description,
  retryLabel,
  formLabel,
  action,
  retryCursor,
}: {
  title: string;
  description: string;
  retryLabel: string;
  formLabel: string;
  action: string;
  retryCursor?: string | null;
}) {
  return (
    <Card className="border-[var(--lifecycle-border)] bg-[var(--lifecycle-surface)]">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {description}
        </p>
        <form action={action} method="get" aria-label={formLabel}>
          {retryCursor ? <input type="hidden" name="timeline" value={retryCursor} /> : null}
          <Button type="submit" variant="outline" className="min-h-11">
            <RotateCcw aria-hidden />
            {retryLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
