'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { SignupPoint } from '@/lib/data/admin-metrics';

export function SignupsChart({ data }: { data: SignupPoint[] }) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const gradientId = `signups-${useId().replaceAll(':', '')}`;
  const total = data.reduce((sum, p) => sum + p.signups, 0);
  const formatDate = (value: string, includeYear = false) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: 'Asia/Dubai',
      month: 'short',
      day: 'numeric',
      year: includeYear ? 'numeric' : undefined,
    }).format(new Date(value));

  const config = {
    signups: {
      label: t('charts.signupsLegend'),
      color: 'var(--chart-1)',
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        <CardDescription>{t('charts.signupsTitle')}</CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums">
          {total.toLocaleString(locale)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full" aria-hidden="true">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-signups)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-signups)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(v: string) => formatDate(v)}
            />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent labelFormatter={(v) => formatDate(v as string, true)} />
              }
            />
            <Area
              type="monotone"
              dataKey="signups"
              stroke="var(--color-signups)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
        <details className="mt-3 text-sm">
          <summary className="focus-visible:ring-ring cursor-pointer rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
            {t('charts.signupsData')}
          </summary>
          <div className="mt-2 overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm">
              <caption className="sr-only">{t('charts.signupsTableCaption')}</caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 text-start font-medium">
                    {t('charts.date')}
                  </th>
                  <th scope="col" className="py-2 text-end font-medium">
                    {t('charts.signupsLegend')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((point) => (
                  <tr key={point.date} className="border-b last:border-0">
                    <th scope="row" className="py-2 text-start font-normal">
                      {formatDate(point.date, true)}
                    </th>
                    <td className="py-2 text-end font-mono tabular-nums">
                      {point.signups.toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
