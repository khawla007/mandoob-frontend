import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  FileText,
  History,
  LockKeyhole,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  REGISTRATION_STAGE_CODES,
  VISA_MILESTONE_CODES,
  countRegistrationProgress,
  formatDubaiRegistrationTimestamp,
  validateRegistrationStages,
  validateVisaPerson,
  type RegistrationBlockerCategory,
  type RegistrationPresentation,
  type RegistrationSourceState,
  type RegistrationStageStatus,
  type VisaPresentationStatus,
} from '@/lib/registration/contracts';

export type RegistrationWorkspaceLabels = {
  stagesTitle: string;
  stagesDescription: string;
  visaTitle: string;
  visaDescription: string;
  blockerTitle: string;
  nextActionTitle: string;
  documentsTitle: string;
  historyTitle: string;
  unavailable: string;
  unavailableDescription: string;
  actionUnavailable: string;
  empty: string;
  partial: string;
  noBlocker: string;
  noNextAction: string;
  noDocuments: string;
  noVisaPeople: string;
  noHistory: string;
  stageCount: string;
  stageLabels: Record<(typeof REGISTRATION_STAGE_CODES)[number], string>;
  stageStatuses: Record<RegistrationStageStatus | 'unavailable', string>;
  visaLabels: Record<(typeof VISA_MILESTONE_CODES)[number], string>;
  visaStatuses: Record<VisaPresentationStatus, string>;
  blockerLabels?: Partial<Record<RegistrationBlockerCategory, string>>;
};

const registrationIcons = {
  not_started: CircleDashed,
  in_progress: CircleDot,
  blocked: AlertCircle,
  completed: CheckCircle2,
  skipped: Ban,
  unavailable: LockKeyhole,
} as const;

const visaIcons = {
  not_started: CircleDashed,
  active: CircleDot,
  blocked: AlertCircle,
  completed: CheckCircle2,
  unavailable: LockKeyhole,
  cancelled: Ban,
} as const;

function StageTracker({
  stages,
  labels,
}: {
  stages: RegistrationPresentation['stages'] | null;
  labels: RegistrationWorkspaceLabels;
}) {
  const rows = stages ? validateRegistrationStages(stages) : null;
  return (
    <ol aria-label={labels.stagesTitle} className="grid gap-2 lg:grid-cols-7">
      {REGISTRATION_STAGE_CODES.map((code, index) => {
        const status = rows?.[index].status ?? 'unavailable';
        const Icon = registrationIcons[status];
        return (
          <li
            key={code}
            data-registration-stage={code}
            aria-current={status === 'in_progress' || status === 'blocked' ? 'step' : undefined}
            className="border-border/70 bg-card min-w-0 rounded-xl border p-3"
          >
            <div className="flex items-start gap-2">
              <Icon aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <span className="text-muted-foreground block font-mono text-[0.68rem]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <strong className="block text-sm leading-5">{labels.stageLabels[code]}</strong>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {labels.stageStatuses[status]}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function VisaTracker({
  people,
  labels,
}: {
  people: RegistrationPresentation['visaPeople'] | null;
  labels: RegistrationWorkspaceLabels;
}) {
  const unavailable = !people;
  const groups = unavailable
    ? [{ key: 'unavailable', displayName: labels.unavailable, stages: null }]
    : people.map((person) => validateVisaPerson(person));
  if (!unavailable && groups.length === 0) {
    return <p className="text-muted-foreground text-sm">{labels.noVisaPeople}</p>;
  }
  return (
    <div className="space-y-4">
      {groups.map((person) => (
        <section key={person.key} className="rounded-xl border p-4">
          <h3 className="font-medium">{person.displayName}</h3>
          <ol
            aria-label={labels.visaTitle}
            className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
          >
            {VISA_MILESTONE_CODES.map((code, index) => {
              const status = person.stages?.[index].status ?? 'unavailable';
              const Icon = visaIcons[status];
              return (
                <li
                  key={code}
                  data-visa-milestone={code}
                  aria-current={status === 'active' || status === 'blocked' ? 'step' : undefined}
                  className="bg-muted/30 flex min-w-0 items-start gap-2 rounded-lg border p-3"
                >
                  <Icon aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 text-sm">
                    <strong className="block">{labels.visaLabels[code]}</strong>
                    <span className="text-muted-foreground text-xs">
                      {labels.visaStatuses[status]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function StateCopy({
  state,
  labels,
}: {
  state: RegistrationSourceState<RegistrationPresentation>;
  labels: RegistrationWorkspaceLabels;
}) {
  if (state.kind === 'empty') return labels.empty;
  if (state.kind === 'partial') return labels.partial;
  if (state.kind === 'unavailable' || state.kind === 'error') return labels.unavailableDescription;
  return null;
}

export function RegistrationWorkspace({
  state,
  role,
  locale,
  labels,
}: {
  state: RegistrationSourceState<RegistrationPresentation>;
  role: 'admin' | 'pro' | 'customer';
  locale: string;
  labels: RegistrationWorkspaceLabels;
}) {
  const value = state.kind === 'ready' || state.kind === 'partial' ? state.value : null;
  const progress = value ? countRegistrationProgress(value.stages) : null;
  const stateCopy = <StateCopy state={state} labels={labels} />;
  const sourceUnavailable = state.kind === 'unavailable' || state.kind === 'error';

  return (
    <div
      data-registration-workspace={role}
      data-registration-source={state.kind}
      className="space-y-4"
    >
      {state.kind !== 'ready' ? (
        <div className="border-border bg-muted/30 flex gap-3 rounded-xl border p-4" role="status">
          <ShieldAlert aria-hidden="true" className="text-primary mt-0.5 size-5 shrink-0" />
          <div>
            <strong className="block">
              {sourceUnavailable ? labels.unavailable : labels.partial}
            </strong>
            <p className="text-muted-foreground mt-1 text-sm">{stateCopy}</p>
          </div>
        </div>
      ) : null}

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{labels.stagesTitle}</CardTitle>
          <CardDescription>{labels.stagesDescription}</CardDescription>
          {progress ? (
            <p className="text-muted-foreground text-sm">
              {labels.stageCount
                .replace('{completed}', String(progress.completed))
                .replace('{total}', String(progress.total))}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <StageTracker stages={value?.stages ?? null} labels={labels} />
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{labels.blockerTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {sourceUnavailable
              ? labels.unavailableDescription
              : value?.currentBlocker
                ? (labels.blockerLabels?.[value.currentBlocker.category] ?? labels.unavailable)
                : labels.noBlocker}
          </CardContent>
        </Card>
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{labels.nextActionTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {sourceUnavailable
                ? labels.unavailableDescription
                : value?.nextAction
                  ? labels.actionUnavailable
                  : labels.noNextAction}
            </p>
            <button
              type="button"
              disabled
              className="border-input bg-muted text-muted-foreground min-h-11 rounded-md border px-4 text-sm font-medium"
            >
              {labels.actionUnavailable}
            </button>
          </CardContent>
        </Card>
      </div>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText aria-hidden="true" className="size-5" /> {labels.documentsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {value?.documents.length ? (
            <ul className="divide-border divide-y">
              {value.documents.map((document) => (
                <li key={document.key} className="py-3 text-sm">
                  <strong>{document.displayLabel}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {sourceUnavailable ? labels.unavailableDescription : labels.noDocuments}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound aria-hidden="true" className="size-5" /> {labels.visaTitle}
          </CardTitle>
          <CardDescription>{labels.visaDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <VisaTracker people={value?.visaPeople ?? null} labels={labels} />
        </CardContent>
      </Card>

      <Card className="signal-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History aria-hidden="true" className="size-5" /> {labels.historyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {value?.history.length ? (
            <ol className="divide-border divide-y">
              {value.history.map((event) => (
                <li key={event.key} className="py-3 text-sm">
                  <time dateTime={event.occurredAt}>
                    {formatDubaiRegistrationTimestamp(event.occurredAt, locale) ??
                      labels.unavailable}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              {sourceUnavailable ? labels.unavailableDescription : labels.noHistory}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
