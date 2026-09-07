import { LockKeyhole, ShieldAlert } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  VISA_MILESTONE_CODES,
  type RegistrationSourceState,
  type VisaPersonView,
} from '@/lib/registration/contracts';

export function VisaProcessWorkspace({
  state,
  labels,
}: {
  state: RegistrationSourceState<VisaPersonView[]>;
  labels: {
    title: string;
    description: string;
    unavailable: string;
    blocker: string;
    nextAction: string;
    documents: string;
    history: string;
    milestones: Record<(typeof VISA_MILESTONE_CODES)[number], string>;
  };
}) {
  const people = state.kind === 'ready' || state.kind === 'partial' ? state.value : null;
  return (
    <Card className="signal-panel" data-visa-process-source={state.kind}>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!people ? (
          <div className="bg-muted/30 flex gap-3 rounded-xl border p-4" role="status">
            <ShieldAlert aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
            <p className="text-muted-foreground text-sm">{labels.unavailable}</p>
          </div>
        ) : null}
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={labels.title}>
          {VISA_MILESTONE_CODES.map((code, index) => (
            <li
              key={code}
              data-visa-milestone={code}
              className="bg-muted/30 flex items-start gap-2 rounded-lg border p-3"
            >
              <LockKeyhole aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
              <span className="text-sm">
                <span className="text-muted-foreground block font-mono text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong>{labels.milestones[code]}</strong>
              </span>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['blocker', labels.blocker],
              ['next-action', labels.nextAction],
              ['documents', labels.documents],
              ['history', labels.history],
            ] as const
          ).map(([region, title]) => (
            <section key={region} data-visa-region={region} className="rounded-xl border p-4">
              <h3 className="font-medium">{title}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{labels.unavailable}</p>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
