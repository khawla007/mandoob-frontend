import { ArrowUpRight, Route } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import { dashboardHref } from './dashboard-links';
import {
  READY_WIDGET_STATUS,
  WidgetMessage,
  WidgetSkeleton,
  type WidgetStatus,
} from './widget-state';

type Streams = ProDashboardData['renewalStreams'];
type StreamType = keyof Streams;

const STREAM_LABELS: Record<StreamType, string> = {
  license: 'Trade licences',
  visa: 'Visas',
  eid: 'Emirates IDs',
  ejari: 'Tenancy & lease',
};
const WINDOWS = ['d7', 'd30', 'd60', 'd90'] as const;

export type RenewalStreamsProps = {
  streams: Streams;
  tenantSlug: string;
  status?: WidgetStatus;
};

export function RenewalStreams({
  streams,
  tenantSlug,
  status = READY_WIDGET_STATUS,
}: RenewalStreamsProps) {
  if (status.kind === 'loading')
    return <WidgetSkeleton rows={4} className="min-h-80 rounded-2xl border p-5" />;
  if (status.kind !== 'ready') return <WidgetMessage status={status} className="min-h-80" />;
  const entries = Object.entries(streams) as Array<[StreamType, Streams[StreamType]]>;
  if (entries.every(([, values]) => values.d90 === 0))
    return (
      <WidgetMessage
        status={{ kind: 'empty', message: 'No renewals due in the next 90 days.' }}
        className="min-h-80"
      />
    );
  const maximum = Math.max(1, ...entries.map(([, values]) => values.d90));

  return (
    <Card className="signal-panel signal-streams">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route aria-hidden="true" className="size-4 text-[var(--signal-info)]" />
          Renewal streams
        </CardTitle>
        <CardDescription>
          Cumulative obligations entering 7, 30, 60, and 90-day windows
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.map(([type, values], streamIndex) => (
          <Link
            key={type}
            href={dashboardHref(tenantSlug, 'renewals', { type, days: '90' })}
            className="group focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{STREAM_LABELS[type]}</span>
              <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-3.5" />
            </span>
            <span
              className="bg-muted relative block h-3 overflow-hidden rounded-sm"
              aria-hidden="true"
            >
              <span
                className="signal-stream-bar absolute inset-y-0 start-0 block transition-[width] duration-500 motion-reduce:transition-none"
                style={
                  {
                    width: `${Math.max(values.d90 ? 8 : 0, (values.d90 / maximum) * 100)}%`,
                    '--stream-offset': `${streamIndex * 9}px`,
                    clipPath:
                      'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
                  } as React.CSSProperties
                }
              />
            </span>
            <span className="mt-2 grid grid-cols-4 gap-2">
              {WINDOWS.map((window) => (
                <span key={window} className="text-muted-foreground text-[10px]">
                  <strong className="text-foreground block font-mono text-xs tabular-nums">
                    {values[window]}
                  </strong>
                  {window.slice(1)} days
                </span>
              ))}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
