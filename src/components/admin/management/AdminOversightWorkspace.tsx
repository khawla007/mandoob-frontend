import { AdminUnavailableAction } from './AdminUnavailableAction';
import { AdminUnavailableWorkspace } from './AdminUnavailableWorkspace';

export function AdminOversightWorkspace({
  summaries,
  filters,
  queueTitle,
  queueDescription,
  stateGuidance,
  unavailableTitle,
  unavailableDescription,
  actionLabel,
  actionExplanation,
}: {
  summaries: readonly string[];
  filters: readonly string[];
  queueTitle: string;
  queueDescription: string;
  stateGuidance: string;
  unavailableTitle: string;
  unavailableDescription: string;
  actionLabel: string;
  actionExplanation: string;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3" aria-label={queueTitle}>
        {summaries.map((summary) => (
          <div
            key={summary}
            data-admin-summary="unavailable"
            className="border-border bg-card rounded-xl border p-4"
          >
            <p className="text-muted-foreground text-xs font-medium">{summary}</p>
            <p className="mt-2 font-mono text-xl" aria-label={`${summary}: unavailable`}>
              —
            </p>
          </div>
        ))}
      </section>

      <section className="border-border bg-card rounded-xl border p-4" aria-label={queueTitle}>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              disabled
              data-admin-filter="unavailable"
              className="border-border text-muted-foreground min-h-10 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      <div data-admin-queue="unavailable">
        <AdminUnavailableWorkspace
          title={queueTitle}
          description={queueDescription}
          unavailableTitle={unavailableTitle}
          unavailableDescription={unavailableDescription}
          guidance={stateGuidance}
        />
      </div>

      <AdminUnavailableAction label={actionLabel} explanation={actionExplanation} />
    </div>
  );
}
