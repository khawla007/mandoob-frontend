import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export function VersionHistoryFeedback({
  loading,
  error,
  empty,
  loadingLabel,
  emptyLabel,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  loadingLabel: string;
  emptyLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-12">
      {loading ? (
        <div role="status" className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {loadingLabel}
        </div>
      ) : error ? (
        <p role="alert" className="text-destructive py-3 text-sm">
          {error}
        </p>
      ) : empty ? (
        <p className="text-muted-foreground py-6 text-sm">{emptyLabel}</p>
      ) : (
        children
      )}
    </div>
  );
}
