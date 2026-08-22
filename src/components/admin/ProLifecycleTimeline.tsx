import Link from 'next/link';
import { CalendarClock, UserRound } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProLifecycleTimelinePage } from '@/lib/data/pro-lifecycle-timeline';
import { buildProTimelineHref, formatProLifecycleTimestamp } from './pro-lifecycle-ui';

export async function ProLifecycleTimeline({
  userId,
  timelinePage,
  invalidCursor,
}: {
  userId: string;
  timelinePage: ProLifecycleTimelinePage;
  invalidCursor: boolean;
}) {
  const [t, locale] = await Promise.all([
    getTranslations('admin.user.proLifecycle.timeline'),
    getLocale(),
  ]);
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
        {timelinePage.items.length ? (
          <ol className="relative space-y-5 border-s ps-5">
            {timelinePage.items.map((item) => (
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
                      <dd className="inline">
                        {item.reason ?? t('unavailable')}{' '}
                        <span className="text-muted-foreground font-mono text-xs">
                          ({item.reasonCode})
                        </span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        )}
        {timelinePage.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={buildProTimelineHref(userId, timelinePage.nextCursor)}>{t('next')}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
