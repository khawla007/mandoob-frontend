import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  delta: number;
  deltaLabel: string;
}) {
  const up = delta >= 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            up ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500',
          )}
        >
          {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
          <span className="tabular-nums">
            {up ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
          <span className="text-muted-foreground font-normal">{deltaLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
