import { Clock3 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardUnavailablePanel({
  title,
  description,
  unavailable,
}: {
  title: string;
  description: string;
  unavailable: string;
}) {
  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock3 aria-hidden="true" className="text-muted-foreground size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p
          role="status"
          className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
        >
          {unavailable}
        </p>
      </CardContent>
    </Card>
  );
}
