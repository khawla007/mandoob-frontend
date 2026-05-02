'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { SignupPoint } from '@/lib/data/admin-metrics';

const config = {
  signups: {
    label: 'Signups',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export function SignupsChart({ data }: { data: SignupPoint[] }) {
  const total = data.reduce((sum, p) => sum + p.signups, 0);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Signups · last 30 days</CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tabular-nums">
          {total.toLocaleString()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-64 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="signupsFill" x1="0" y1="0" x2="0" y2="1">
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
              tickFormatter={(v: string) =>
                new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
            />
            <YAxis tickLine={false} axisLine={false} width={32} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(v) =>
                    new Date(v as string).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                />
              }
            />
            <Area
              type="monotone"
              dataKey="signups"
              stroke="var(--color-signups)"
              strokeWidth={2}
              fill="url(#signupsFill)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
