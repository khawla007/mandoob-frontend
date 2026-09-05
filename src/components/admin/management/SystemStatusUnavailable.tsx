import { AdminUnavailableAction } from './AdminUnavailableAction';
import { AdminUnavailableWorkspace } from './AdminUnavailableWorkspace';

export function SystemStatusUnavailable({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="space-y-6" data-live="false">
      <section className="grid gap-3 md:grid-cols-3" aria-label={labels.status}>
        {[labels.generated, labels.monitoring, labels.source].map((label) => (
          <div key={label} className="border-border bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="text-muted-foreground mt-2 text-sm">{labels.unavailable}</p>
          </div>
        ))}
      </section>
      <AdminUnavailableWorkspace
        title={labels.status}
        description={labels.description}
        guidance={labels.guidance}
        unavailableTitle={labels.unavailableTitle}
        unavailableDescription={labels.unavailableDescription}
      />
      <AdminUnavailableAction label={labels.refresh} explanation={labels.actionExplanation} />
    </div>
  );
}
