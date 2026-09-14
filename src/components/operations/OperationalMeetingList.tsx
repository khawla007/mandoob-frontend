import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MeetingStatus } from '@/lib/data/meetings';
import {
  meetingBadgeVariant,
  safeExternalMeetingHref,
} from '@/lib/operations/meeting-presentation';

export type OperationalMeetingDisplay = {
  id: string;
  title: string;
  status: MeetingStatus;
  statusLabel: string;
  whenLabel: string;
  durationLabel: string;
  meetingUrl: string | null;
  recordingUrl: string | null;
};

export function OperationalMeetingList({
  meetings,
  emptyLabel,
  joinLabel,
  recordingLabel,
  actions = {},
  details = {},
}: {
  meetings: readonly OperationalMeetingDisplay[];
  emptyLabel: string;
  joinLabel: string;
  recordingLabel: string;
  actions?: Readonly<Record<string, ReactNode>>;
  details?: Readonly<Record<string, ReactNode>>;
}) {
  if (!meetings.length) return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;

  return (
    <ul className="divide-border divide-y">
      {meetings.map((meeting) => {
        const meetingHref = safeExternalMeetingHref(meeting.meetingUrl);
        const recordingHref = safeExternalMeetingHref(meeting.recordingUrl);
        return (
          <li key={meeting.id} className="py-4">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="font-medium break-words">{meeting.title}</p>
                  <Badge variant={meetingBadgeVariant(meeting.status)}>{meeting.statusLabel}</Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {meeting.whenLabel} · {meeting.durationLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {meetingHref ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={meetingHref} target="_blank" rel="noopener noreferrer">
                      {joinLabel}
                    </a>
                  </Button>
                ) : null}
                {recordingHref ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={recordingHref} target="_blank" rel="noopener noreferrer">
                      {recordingLabel}
                    </a>
                  </Button>
                ) : null}
                {actions[meeting.id]}
              </div>
            </div>
            {details[meeting.id]}
          </li>
        );
      })}
    </ul>
  );
}
