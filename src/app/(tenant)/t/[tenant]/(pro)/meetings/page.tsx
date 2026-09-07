import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';

import {
  OperationalMeetingList,
  type OperationalMeetingDisplay,
} from '@/components/operations/OperationalMeetingList';
import { MeetingAiSummaryCard } from '@/components/pro/MeetingAiSummaryCard';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requireProTenantRouteAccess } from '@/lib/auth/require-tenant-route-access';
import { readAssignedCompanyForPro } from '@/lib/data/company-profile';
import {
  getCompanyMeetingRecordingSignedUrl,
  listMeetingsForCompany,
  listOpenMeetingSlots,
  type Meeting,
  type MeetingActor,
} from '@/lib/data/meetings';
import { listMeetingAiSummariesForMeetings } from '@/lib/data/meeting-ai-summaries';
import { partitionMeetings, safeExternalMeetingHref } from '@/lib/operations/meeting-presentation';
import { cancelMeetingAction, createMeetingSlotAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProMeetingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const { tenant, session } = await requireProTenantRouteAccess(slug);
  const company = await readAssignedCompanyForPro(session.id, slug);
  if (!company || company.tenantId !== tenant.id) notFound();

  const [t, locale] = await Promise.all([getTranslations('meetingOperations'), getLocale()]);
  const actor: MeetingActor = { id: session.id, role: 'pro', tenantId: tenant.id };
  const now = new Date();
  const slotWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [meetings, openSlots] = await Promise.all([
    listMeetingsForCompany(company.id, actor),
    listOpenMeetingSlots(tenant.id, now.toISOString(), slotWindowEnd.toISOString()),
  ]);
  const recordingPairs = await Promise.all(
    meetings
      .filter((meeting) => meeting.recordingStoragePath)
      .map(
        async (meeting) =>
          [
            meeting.id,
            await getCompanyMeetingRecordingSignedUrl(meeting.id, company.id, actor),
          ] as const,
      ),
  );
  const recordingUrls = new Map(
    recordingPairs.filter((pair): pair is readonly [string, string] => Boolean(pair[1])),
  );
  const summaries = await listMeetingAiSummariesForMeetings(
    meetings.map(({ id }) => id),
    actor,
  );
  const { upcoming, past } = partitionMeetings(meetings, now);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  const display = (rows: Meeting[]): OperationalMeetingDisplay[] =>
    rows.map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      statusLabel: t(`statuses.${meeting.status}`),
      whenLabel: date.format(new Date(meeting.scheduledAt)),
      durationLabel: t('duration', { minutes: meeting.durationMinutes }),
      meetingUrl: safeExternalMeetingHref(meeting.meetingUrl),
      recordingUrl: safeExternalMeetingHref(recordingUrls.get(meeting.id) ?? null),
    }));
  const details = Object.fromEntries(
    meetings.map((meeting) => [
      meeting.id,
      <MeetingAiSummaryCard
        key={meeting.id}
        meetingId={meeting.id}
        slug={slug}
        summary={summaries.get(meeting.id) ?? null}
      />,
    ]),
  );
  const cancellation = Object.fromEntries(
    upcoming.map((meeting) => [
      meeting.id,
      <form
        key={meeting.id}
        action={async () => {
          'use server';
          await cancelMeetingAction(slug, meeting.id);
        }}
      >
        <Button type="submit" size="sm" variant="ghost">
          {t('cancel')}
        </Button>
      </form>,
    ]),
  );

  return (
    <div className="signal-dashboard min-w-0 space-y-5">
      <DashboardPageHeader
        eyebrow={t('pro.eyebrow')}
        title={t('title')}
        description={t('pro.description', { company: company.companyName })}
      />
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('pro.createTitle')}</CardTitle>
          <CardDescription>{t('pro.createDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[1fr_10rem_10rem_auto] md:items-end"
            action={async (formData) => {
              'use server';
              await createMeetingSlotAction(slug, formData);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="starts_at">{t('start')}</Label>
              <Input id="starts_at" name="starts_at" type="datetime-local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">{t('durationLabel')}</Label>
              <Input
                id="duration_minutes"
                name="duration_minutes"
                type="number"
                min="15"
                max="180"
                defaultValue="30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t('timezone')}</Label>
              <Input id="timezone" name="timezone" value="Asia/Dubai" readOnly />
            </div>
            <Button type="submit">{t('create')}</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <Card className="signal-panel min-w-0">
          <CardHeader>
            <CardTitle>{t('openSlots')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {openSlots.length ? (
                openSlots.map((slot) => (
                  <li key={slot.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">{date.format(new Date(slot.startsAt))}</p>
                    <p className="text-muted-foreground">{slot.timezone}</p>
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground text-sm">{t('noOpenSlots')}</li>
              )}
            </ul>
          </CardContent>
        </Card>
        <Card className="signal-panel min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>{t('upcoming')}</CardTitle>
          </CardHeader>
          <CardContent>
            <OperationalMeetingList
              meetings={display(upcoming)}
              emptyLabel={t('noUpcoming')}
              joinLabel={t('join')}
              recordingLabel={t('recording')}
              actions={cancellation}
              details={details}
            />
          </CardContent>
        </Card>
      </div>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('past')}</CardTitle>
        </CardHeader>
        <CardContent>
          <OperationalMeetingList
            meetings={display(past)}
            emptyLabel={t('noPast')}
            joinLabel={t('join')}
            recordingLabel={t('recording')}
            details={details}
          />
        </CardContent>
      </Card>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('unavailableTitle')}</CardTitle>
          <CardDescription>{t('unavailableDescription')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
