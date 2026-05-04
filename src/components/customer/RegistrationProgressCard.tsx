import { Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RegistrationProgress } from '@/lib/mocks/customer-portal';

export function RegistrationProgressCard({ data }: { data: RegistrationProgress }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Registration progress</CardTitle>
        <CardDescription>Where your company stands in the UAE registration flow.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
          {data.stages.map((stage, idx) => {
            const last = idx === data.stages.length - 1;
            const circleClass =
              stage.state === 'done'
                ? 'bg-primary text-primary-foreground border-primary'
                : stage.state === 'current'
                  ? 'border-primary text-primary bg-primary/10 ring-primary/30 ring-4'
                  : 'border-border text-muted-foreground bg-card';
            const labelClass =
              stage.state === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium';
            return (
              <li
                key={stage.key}
                className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2"
              >
                <div className="flex flex-col items-center sm:w-full">
                  <div
                    className={
                      'flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors ' +
                      circleClass
                    }
                  >
                    {stage.state === 'done' ? <Check className="size-4" /> : idx + 1}
                  </div>
                  {!last && (
                    <div className="bg-border mx-auto hidden h-px w-full flex-1 sm:block" />
                  )}
                </div>
                <div className={'text-xs sm:mt-2 sm:text-center ' + labelClass}>{stage.label}</div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
