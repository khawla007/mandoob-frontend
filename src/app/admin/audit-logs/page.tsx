import { ScrollText } from 'lucide-react';

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground mt-1 text-sm">Coming soon.</p>
      </div>
      <div className="border-border/60 text-muted-foreground flex h-64 items-center justify-center rounded-lg border border-dashed">
        <div className="flex flex-col items-center gap-2 text-sm">
          <ScrollText className="size-6" />
          Placeholder — wire up to Supabase in a follow-up.
        </div>
      </div>
    </div>
  );
}
