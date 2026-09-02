import { FileClock } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import { formatSignalDeadline } from './widget-format';
import { WidgetMessage, type WidgetBaseLabels, type WidgetStateProps } from './widget-state';

type PendingDocumentsData = { documents: ProDashboardData['pendingDocuments']; tenantSlug: string };
export type PendingDocumentsLabels = WidgetBaseLabels & {
  title: string;
  description: string;
  empty: string;
  openDocuments: string;
  states: Record<ProDashboardData['pendingDocuments'][number]['state'], string>;
};

export function PendingDocuments(
  props: WidgetStateProps<PendingDocumentsData, PendingDocumentsLabels>,
) {
  if (props.kind === 'loading') return null;
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={props.labels.retry} className="min-h-52" />;
  if (props.documents.length === 0)
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: props.labels.empty,
          emptyAction: {
            label: props.labels.openDocuments,
            href: `/t/${encodeURIComponent(props.tenantSlug)}/documents`,
          },
        }}
        retryLabel={props.labels.retry}
        className="min-h-52"
      />
    );

  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileClock aria-hidden="true" className="size-4 text-[var(--signal-warning)]" />
          {props.labels.title}
        </CardTitle>
        <CardDescription>{props.labels.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-border divide-y">
          {props.documents.slice(0, 5).map((document) => (
            <li key={`${document.state}:${document.id}`}>
              <Link
                href={document.href}
                className="focus-visible:ring-ring flex min-h-12 items-center justify-between gap-3 rounded-md py-2 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{document.label}</strong>
                  <span className="text-muted-foreground text-xs">
                    {props.labels.states[document.state]}
                  </span>
                </span>
                {document.deadline ? (
                  <time
                    className="shrink-0 font-mono text-xs tabular-nums"
                    dateTime={document.deadline}
                  >
                    {formatSignalDeadline(document.deadline, props.locale)}
                  </time>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
