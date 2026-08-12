import { ArrowUpRight, Route } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProDashboardData } from '@/lib/data/pro-dashboard';

import { renewalSignalHref } from '@/lib/signal-studio-filters';
import {
  WidgetLoading,
  WidgetMessage,
  type WidgetBaseLabels,
  type WidgetStateProps,
} from './widget-state';

type Streams = ProDashboardData['renewalStreams'];
type StreamType = keyof Streams;

const WINDOWS = ['d7', 'd30', 'd60', 'd90'] as const;

type RenewalStreamsDataProps = {
  streams: Streams;
  tenantSlug: string;
};

export type RenewalStreamsLabels = WidgetBaseLabels & {
  empty: string;
  openRenewals: string;
  title: string;
  description: string;
  days: string;
  types: Record<StreamType, string>;
};
export type RenewalStreamsProps = WidgetStateProps<RenewalStreamsDataProps, RenewalStreamsLabels>;

export function RenewalStreams(props: RenewalStreamsProps) {
  const { labels } = props;
  if (props.kind === 'loading') {
    return (
      <WidgetLoading
        testId="signal-streams-skeleton"
        label={labels.loading}
        className="min-h-80 space-y-5 rounded-2xl border p-5"
      >
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-72" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-4 gap-2">
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
            </div>
          </div>
        ))}
      </WidgetLoading>
    );
  }
  if (props.kind === 'empty' || props.kind === 'error')
    return <WidgetMessage status={props} retryLabel={labels.retry} className="min-h-80" />;

  const { streams, tenantSlug } = props;
  const entries = Object.entries(streams) as Array<[StreamType, Streams[StreamType]]>;
  if (entries.every(([, values]) => values.d90 === 0))
    return (
      <WidgetMessage
        status={{
          kind: 'empty',
          message: labels.empty,
          emptyAction: {
            label: labels.openRenewals,
            href: `/t/${encodeURIComponent(tenantSlug)}/renewals`,
          },
        }}
        retryLabel={labels.retry}
        className="min-h-80"
      />
    );
  const maximum = Math.max(1, ...entries.map(([, values]) => values.d90));

  return (
    <Card className="signal-panel signal-streams">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route aria-hidden="true" className="size-4 text-[var(--signal-info)]" />
          {labels.title}
        </CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {entries.map(([type, values], streamIndex) => (
          <Link
            key={type}
            href={renewalSignalHref(tenantSlug, { tab: 'active', type, days: 90 })}
            className="group focus-visible:ring-ring block rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{labels.types[type]}</span>
              <ArrowUpRight aria-hidden="true" className="text-muted-foreground size-3.5" />
            </span>
            <span
              className="bg-muted relative block h-3 overflow-hidden rounded-sm"
              aria-hidden="true"
            >
              <span
                className="signal-stream-bar absolute inset-y-0 start-0 block transition-[width] duration-500 motion-reduce:transition-none rtl:scale-x-[-1]"
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
                  {window.slice(1)} {labels.days}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
