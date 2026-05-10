import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { requireRole } from '@/lib/auth/require-role';
import {
  getMeetingRecordingSignedUrl,
  listMeetingsForTenant,
  listOpenMeetingSlots,
  type Meeting,
  type MeetingActor,
} from '@/lib/data/meetings';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { cancelMeetingAction, createMeetingSlotAction } from './actions';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

function splitMeetings(rows: Meeting[]) {
  const now = Date.now();
  return {
    upcoming: rows.filter((row) => row.status === 'scheduled' && new Date(row.scheduledAt).getTime() >= now),
    past: rows.filter((row) => row.status !== 'scheduled' || new Date(row.scheduledAt).getTime() < now),
  };
}

async function MeetingList({
  meetings,
  slug,
  recordingUrls,
}: {
  meetings: Meeting[];
  slug: string;
  recordingUrls: Map<string, string>;
}) {
  if (!meetings.length) {
    return <p className="text-muted-foreground text-sm">No meetings in this list.</p>;
  }

  return (
    <div className="divide-border divide-y">
      {meetings.map((meeting) => {
        const recordingUrl = recordingUrls.get(meeting.id);
        return (
          <div key={meeting.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{meeting.title}</p>
                <Badge variant={meeting.status === 'recording_ready' ? 'default' : 'secondary'}>
                  {meeting.status.replace('_', ' ')}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {formatDate(meeting.scheduledAt)} · {meeting.durationMinutes} min
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {meeting.meetingUrl ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={meeting.meetingUrl}>Join</Link>
                </Button>
              ) : null}
              {recordingUrl ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={recordingUrl}>Recording</Link>
                </Button>
              ) : null}
              {meeting.status === 'scheduled' ? (
                <form
                  action={async () => {
                    'use server';
                    await cancelMeetingAction(slug, meeting.id);
                  }}
                >
                  <Button type="submit" size="sm" variant="ghost">
                    Cancel
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function ProMeetingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const session = await requireRole('pro');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const actor: MeetingActor = { id: session.id, role: 'pro', tenantId: tenant.id };
  const now = new Date();
  const slotWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [meetings, openSlots] = await Promise.all([
    listMeetingsForTenant(tenant.id, actor),
    listOpenMeetingSlots(
      tenant.id,
      now.toISOString(),
      slotWindowEnd.toISOString(),
    ),
  ]);
  const recordingPairs = await Promise.all(
    meetings
      .filter((meeting) => meeting.recordingStoragePath)
      .map(async (meeting) => [meeting.id, await getMeetingRecordingSignedUrl(meeting.id, actor)] as const),
  );
  const recordingUrls = new Map(recordingPairs.filter((pair): pair is readonly [string, string] => Boolean(pair[1])));
  const { upcoming, past } = splitMeetings(meetings);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Publish consultation slots, join Daily.co rooms, and access private recordings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Create slot</CardTitle>
          <CardDescription>Slots appear in the customer portal for booking.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-[1fr_160px_160px_auto] md:items-end"
            action={async (formData) => {
              'use server';
              await createMeetingSlotAction(slug, formData);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="starts_at">Start</Label>
              <Input id="starts_at" name="starts_at" type="datetime-local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Duration</Label>
              <Input id="duration_minutes" name="duration_minutes" type="number" min="15" max="180" defaultValue="30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" name="timezone" defaultValue="Asia/Dubai" />
            </div>
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Open slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openSlots.length ? (
              openSlots.map((slot) => (
                <div key={slot.id} className="border-border rounded-md border p-3 text-sm">
                  <div className="font-medium">{formatDate(slot.startsAt)}</div>
                  <div className="text-muted-foreground">{slot.timezone}</div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No open slots in the next 30 days.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingList meetings={upcoming} slug={slug} recordingUrls={recordingUrls} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Past and recordings</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingList meetings={past} slug={slug} recordingUrls={recordingUrls} />
        </CardContent>
      </Card>
    </div>
  );
}
