import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/require-role';
import { readSelfCustomer } from '@/lib/data/account-self';
import {
  getMeetingRecordingSignedUrl,
  listMeetingsForCustomer,
  listOpenMeetingSlots,
  type MeetingActor,
} from '@/lib/data/meetings';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { bookMeetingSlotAction } from './actions';

export const dynamic = 'force-dynamic';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

export default async function CustomerMeetingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const session = await requireRole('customer');
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) notFound();

  const customer = await readSelfCustomer().catch(() => ({ linkedClientId: null }));
  const actor: MeetingActor = { id: session.id, role: 'customer', tenantId: tenant.id };
  const now = new Date();
  const slotWindowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [meetings, openSlots] = await Promise.all([
    listMeetingsForCustomer(session.id),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Book consultation slots, join calls, and review recordings attached to your file.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available slots</CardTitle>
          <CardDescription>
            Meetings may be recorded and attached to your customer file for follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customer.linkedClientId ? (
            <div className="grid gap-3 md:grid-cols-2">
              {openSlots.length ? (
                openSlots.map((slot) => (
                  <div key={slot.id} className="border-border rounded-md border p-4">
                    <div className="font-medium">{formatDate(slot.startsAt)}</div>
                    <div className="text-muted-foreground mt-1 text-sm">{slot.timezone}</div>
                    <form
                      className="mt-4"
                      action={async () => {
                        'use server';
                        await bookMeetingSlotAction(slug, slot.id);
                      }}
                    >
                      <Button type="submit" size="sm">
                        Book
                      </Button>
                    </form>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">No consultation slots are open right now.</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Your account is not linked to a client file yet. Ask your PRO firm to link your profile before booking.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {meetings.length ? (
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
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No meetings booked yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
