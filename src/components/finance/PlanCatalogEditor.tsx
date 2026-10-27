import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PlanCatalogEditor({
  title,
  description,
  stateLabel,
  children,
}: {
  title: string;
  description: string;
  stateLabel: string;
  children: ReactNode;
}) {
  return (
    <Card className="signal-panel min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <span className="bg-muted rounded-md px-2 py-1 font-mono text-xs">{stateLabel}</span>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
