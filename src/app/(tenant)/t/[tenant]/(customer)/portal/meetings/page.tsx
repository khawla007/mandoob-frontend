import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';

import {
  OperationalMeetingList,
  type OperationalMeetingDisplay,
} from '@/components/operations/OperationalMeetingList';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { MeetingCollaborationPanel } from '@/components/operations/MeetingCollaborationPanel';
import { MeetingScheduleControls } from '@/components/operations/MeetingScheduleControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authorizeCustomerLinkedCompanyRead } from '@/lib/data/customer-company-access';
import { listMeetingCollaboration } from '@/lib/data/meeting-collaboration';
import {
  getCustomerCompanyMeetingRecordingSignedUrl,
  listMeetingsForCustomerCompany,
  listOpenMeetingSlots,
  type MeetingActor,
} from '@/lib/data/meetings';
import { safeExternalMeetingHref } from '@/lib/operations/meeting-presentation';
import {
  bookMeetingSlotAction,
  cancelCustomerMeetingAction,
  rescheduleCustomerMeetingAction,
  setCustomerMeetingConsentAction,
} from './actions';

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
  const collaboration = await listMeetingCollaboration(
    meetings.map(({ id }) => id),
    access.session.id,
    false,
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
  const collaborationLabels = {
    consentTitle: t('collaboration.consentTitle'),
    consentDescription: t('collaboration.consentDescription'),
    consentGranted: t('collaboration.consentGranted'),
    consentRequired: t('collaboration.consentRequired'),
    grantConsent: t('collaboration.grantConsent'),
    withdrawConsent: t('collaboration.withdrawConsent'),
    notePlaceholder: t('collaboration.notePlaceholder'),
    addNote: t('collaboration.addNote'),
    notes: t('collaboration.notes'),
    actions: t('collaboration.actions'),
    accept: t('collaboration.accept'),
    dismiss: t('collaboration.dismiss'),
  };
  const details = Object.fromEntries(
    meetings.map((meeting) => {
      const canChange = meeting.status === 'scheduled' && new Date(meeting.scheduledAt) > now;
      const cancelOperationId = randomUUID();
      const rescheduleOperationId = randomUUID();
      return [
        meeting.id,
        <div key={meeting.id} className="space-y-3">
          {canChange ? (
            <MeetingScheduleControls
              rescheduleLabel={t('reschedule')}
              cancelLabel={t('cancel')}
              startLabel={t('start')}
              durationLabel={t('durationLabel')}
              reschedule={async (formData) => {
                'use server';
                await rescheduleCustomerMeetingAction(
                  slug,
                  meeting.id,
                  meeting.version,
                  rescheduleOperationId,
                  formData,
                );
              }}
              cancel={async () => {
                'use server';
                await cancelCustomerMeetingAction(
                  slug,
                  meeting.id,
                  meeting.version,
                  cancelOperationId,
                );
              }}
            />
          ) : null}
          <MeetingCollaborationPanel
            state={
              collaboration.get(meeting.id) ?? { consentGranted: false, notes: [], actions: [] }
            }
            canReview={false}
            canAddNote={false}
            labels={collaborationLabels}
            setConsent={async (granted) => {
              'use server';
              await setCustomerMeetingConsentAction(slug, meeting.id, granted);
            }}
          />
        </div>,
      ];
    }),
  );

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
              openSlots.map((slot) => {
                const operationId = randomUUID();
                return (
                  <li key={slot.id} className="rounded-lg border p-4">
                    <p className="font-medium">{date.format(new Date(slot.startsAt))}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{slot.timezone}</p>
                    <form
                      className="mt-4"
                      action={async () => {
                        'use server';
                        await bookMeetingSlotAction(slug, slot.id, slot.version, operationId);
                      }}
                    >
                      <Button type="submit" size="sm">
                        {t('book')}
                      </Button>
                    </form>
                  </li>
                );
              })
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
            details={details}
          />
        </CardContent>
      </Card>
    </div>
  );
}
