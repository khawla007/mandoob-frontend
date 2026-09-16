import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CostDataSummaryCard({
  label,
  value,
  badge,
  tone,
}: {
  label: string;
  value: string;
  badge?: string;
  tone: 'info' | 'success' | 'orange';
}) {
  return (
    <Card className={`cost-data-summary__instrument cost-data-summary__instrument--${tone}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-2xl font-semibold tabular-nums">{value}</div>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </CardContent>
    </Card>
  );
}
