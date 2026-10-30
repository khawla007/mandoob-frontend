import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type FinanceSummaryItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  state?: 'neutral' | 'success' | 'warning' | 'urgent';
};

const stateClass = {
  neutral: '',
  success: 'border-signal-success/35',
  warning: 'border-signal-warning/35',
  urgent: 'border-signal-urgent/35',
} as const;

export function FinanceSummary({ label, items }: { label: string; items: FinanceSummaryItem[] }) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.key} className={`min-w-0 ${stateClass[item.state ?? 'neutral']}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold break-words">{item.value}</p>
            {item.detail ? (
              <p className="text-muted-foreground mt-1 text-xs">{item.detail}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
