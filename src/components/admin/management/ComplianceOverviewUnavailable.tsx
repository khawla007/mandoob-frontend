import { AdminUnavailableAction } from './AdminUnavailableAction';
import { AdminUnavailableWorkspace } from './AdminUnavailableWorkspace';

export function ComplianceOverviewUnavailable({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2" aria-label={labels.overview}>
        {[labels.controls, labels.evidence, labels.retention, labels.erasure].map((label) => (
          <div key={label} className="border-border bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="text-muted-foreground mt-2 text-sm">{labels.unavailable}</p>
          </div>
        ))}
      </section>
      <AdminUnavailableWorkspace
        title={labels.overview}
        description={labels.description}
        guidance={labels.guidance}
        unavailableTitle={labels.unavailableTitle}
        unavailableDescription={labels.unavailableDescription}
      />
      <AdminUnavailableAction label={labels.openEvidence} explanation={labels.actionExplanation} />
    </div>
  );
}
