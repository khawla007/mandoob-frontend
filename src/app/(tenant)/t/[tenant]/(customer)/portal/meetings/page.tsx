import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import {
  OperationalMeetingList,
  type OperationalMeetingDisplay,
} from '@/components/operations/OperationalMeetingList';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import {
  getCustomerCompanyMeetingRecordingSignedUrl,
  listMeetingsForCustomerCompany,
  listOpenMeetingSlots,
  type MeetingActor,
} from '@/lib/data/meetings';
import { safeExternalMeetingHref } from '@/lib/operations/meeting-presentation';
import { bookMeetingSlotAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomerMeetingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const access = await authorizeCustomerLinkedCompanyRead(slug);
  if (access.kind !== 'authorized') notFound();
  const [t, locale] = await Promise.all([getTranslations('meetingOperations'), getLocale()]);
  const actor: MeetingActor = {
    id: access.session.id,
    role: 'customer',
    tenantId: access.tenant.id,
  };
  const now = new Date();
  const slotWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [meetings, openSlots] = await Promise.all([
    listMeetingsForCustomerCompany(access.session.id, access.company.id, actor),
    listOpenMeetingSlots(access.tenant.id, now.toISOString(), slotWindowEnd.toISOString()),
  ]);
  const recordingPairs = await Promise.all(
    meetings
      .filter((meeting) => meeting.recordingStoragePath)
      .map(
        async (meeting) =>
          [
            meeting.id,
            await getCustomerCompanyMeetingRecordingSignedUrl(meeting.id, access.company.id, actor),
          ] as const,
      ),
  );
  const recordingUrls = new Map(
    recordingPairs.filter((pair): pair is readonly [string, string] => Boolean(pair[1])),
  );
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  const display: OperationalMeetingDisplay[] = meetings.map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    statusLabel: t(`statuses.${meeting.status}`),
    whenLabel: date.format(new Date(meeting.scheduledAt)),
    durationLabel: t('duration', { minutes: meeting.durationMinutes }),
    meetingUrl: safeExternalMeetingHref(meeting.meetingUrl),
    recordingUrl: safeExternalMeetingHref(recordingUrls.get(meeting.id) ?? null),
  }));

  return (
    <div className="signal-dashboard min-w-0 space-y-5">
      <DashboardPageHeader
        eyebrow={t('customer.eyebrow')}
        title={t('title')}
        description={t('customer.description', { company: access.company.companyName })}
      />
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('availableSlots')}</CardTitle>
          <CardDescription>{t('customer.slotDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 md:grid-cols-2">
            {openSlots.length ? (
              openSlots.map((slot) => (
                <li key={slot.id} className="rounded-lg border p-4">
                  <p className="font-medium">{date.format(new Date(slot.startsAt))}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{slot.timezone}</p>
                  <form
                    className="mt-4"
                    action={async () => {
                      'use server';
                      await bookMeetingSlotAction(slug, slot.id);
                    }}
                  >
                    <Button type="submit" size="sm">
                      {t('book')}
                    </Button>
                  </form>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground text-sm">{t('noOpenSlots')}</li>
            )}
          </ul>
        </CardContent>
      </Card>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('yourMeetings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <OperationalMeetingList
            meetings={display}
            emptyLabel={t('noCustomerMeetings')}
            joinLabel={t('join')}
            recordingLabel={t('recording')}
          />
        </CardContent>
      </Card>
      <Card className="signal-panel">
        <CardHeader>
          <CardTitle>{t('consentTitle')}</CardTitle>
          <CardDescription>{t('consentUnavailable')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
