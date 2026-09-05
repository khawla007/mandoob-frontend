import { AdminUnavailableAction } from './AdminUnavailableAction';
import { AdminUnavailableWorkspace } from './AdminUnavailableWorkspace';

export function ReportCatalogUnavailable({ labels }: { labels: Record<string, string> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label={labels.catalog}>
        {[labels.scope, labels.period, labels.format, labels.delivery].map((label) => (
          <div key={label} className="border-border bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="text-muted-foreground mt-2 text-sm">{labels.unavailable}</p>
          </div>
        ))}
      </section>
      <AdminUnavailableWorkspace
        title={labels.catalog}
        description={labels.description}
        guidance={labels.guidance}
        unavailableTitle={labels.unavailableTitle}
        unavailableDescription={labels.unavailableDescription}
      />
      <AdminUnavailableAction label={labels.export} explanation={labels.actionExplanation} />
    </div>
  );
}
