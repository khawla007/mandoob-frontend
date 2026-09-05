import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';

export function AdminUnavailableWorkspace({
  title,
  description,
  unavailableTitle,
  unavailableDescription,
  guidance,
}: {
  title: string;
  description: string;
  unavailableTitle: string;
  unavailableDescription: string;
  guidance: string;
}) {
  return (
    <section data-admin-module-workspace="unavailable" className="space-y-4">
      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">{description}</p>
        <p className="text-muted-foreground mt-4 text-sm leading-6">{guidance}</p>
      </div>
      <DashboardRouteState
        state="unavailable"
        variant="panel"
        title={unavailableTitle}
        description={unavailableDescription}
      />
    </section>
  );
}
