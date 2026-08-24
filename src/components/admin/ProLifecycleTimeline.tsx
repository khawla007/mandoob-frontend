import Link from 'next/link';
import { CalendarClock, RotateCcw, UserRound } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProLifecycleTimelinePage } from '@/lib/data/pro-lifecycle-timeline';
import { buildProTimelineHref, formatProLifecycleTimestamp } from './pro-lifecycle-ui';

export async function ProLifecycleTimeline({
  userId,
  timelinePage,
  invalidCursor,
  sourceState,
}: {
  userId: string;
  timelinePage: ProLifecycleTimelinePage;
  invalidCursor: boolean;
  sourceState?: { kind: 'ready'; timelinePage: ProLifecycleTimelinePage } | { kind: 'error' };
}) {
  const [t, locale] = await Promise.all([
    getTranslations('admin.user.proLifecycle.timeline'),
    getLocale(),
  ]);
  const resolved = sourceState ?? { kind: 'ready', timelinePage };
  if (resolved.kind === 'error') {
    return (
      <Card className="border-[var(--lifecycle-border)] bg-[var(--lifecycle-surface)]">
        <CardHeader>
          <CardTitle>
            <h2>{t('title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
            {t('loadError')}
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/admin/users/${userId}`}>
              <RotateCcw aria-hidden />
              {t('retry')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const availableTimeline = resolved.timelinePage;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('title')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {invalidCursor ? (
          <p role="status" className="text-muted-foreground text-sm">
            {t('invalidCursor')}
          </p>
        ) : null}
        {availableTimeline.items.length ? (
          <ol className="relative space-y-5 border-s ps-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            {availableTimeline.items.map((item) => (
              <li key={`${item.eventAt}-${item.eventId}`} className="space-y-2">
                <CalendarClock
                  aria-hidden
                  className="bg-card text-primary absolute -start-2.5 size-5"
                />
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">{t(`events.${item.eventKind}`)}</h3>
                  <time className="text-muted-foreground text-xs" dateTime={item.eventAt} dir="ltr">
                    {formatProLifecycleTimestamp(item.eventAt, locale)}
                  </time>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground inline">{t('actor')}: </dt>
                    <dd className="inline">
                      <UserRound aria-hidden className="me-1 inline size-4" />
                      {item.actorDisplayName ?? t('unavailable')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">{t('company')}: </dt>
                    <dd className="inline">{item.companyDisplayName ?? t('unavailable')}</dd>
                  </div>
                  {item.reasonCode ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground inline">{t('reason')}: </dt>
                      <dd className="inline">{item.reason ?? t('unavailable')}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        )}
        {availableTimeline.nextCursor ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={buildProTimelineHref(userId, availableTimeline.nextCursor)}>
              {t('next')}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
