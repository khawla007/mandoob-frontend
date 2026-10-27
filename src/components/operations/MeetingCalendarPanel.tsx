import { OperationalMeetingList } from '@/components/operations/OperationalMeetingList';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Meeting } from '@/lib/data/meetings';
import { safeExternalMeetingHref } from '@/lib/operations/meeting-presentation';

export function MeetingCalendarPanel({
  meetings,
  locale,
  title,
  description,
  emptyLabel,
  joinLabel,
  recordingLabel,
  durationLabel,
  statusLabel,
}: {
  meetings: Meeting[];
  locale: string;
  title: string;
  description: string;
  emptyLabel: string;
  joinLabel: string;
  recordingLabel: string;
  durationLabel: (minutes: number) => string;
  statusLabel: (status: Meeting['status']) => string;
}) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  return (
    <Card className="signal-panel min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <OperationalMeetingList
          meetings={meetings.map((meeting) => ({
            id: meeting.id,
            title: meeting.title,
            status: meeting.status,
            statusLabel: statusLabel(meeting.status),
            whenLabel: date.format(new Date(meeting.scheduledAt)),
            durationLabel: durationLabel(meeting.durationMinutes),
            meetingUrl: safeExternalMeetingHref(meeting.meetingUrl),
            recordingUrl: null,
          }))}
          emptyLabel={emptyLabel}
          joinLabel={joinLabel}
          recordingLabel={recordingLabel}
        />
      </CardContent>
    </Card>
  );
}
