import type { MeetingStatus } from '@/lib/data/meetings';

type MeetingLike = { id: string; status: MeetingStatus; scheduledAt: string };

export function meetingBadgeVariant(
  status: MeetingStatus,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'recording_ready' || status === 'completed') return 'default';
  if (status === 'no_show') return 'destructive';
  if (status === 'cancelled') return 'outline';
  return 'secondary';
}

export function partitionMeetings<T extends MeetingLike>(rows: readonly T[], now: Date) {
  const current = now.getTime();
  return {
    upcoming: rows.filter(
      (row) => row.status === 'scheduled' && Date.parse(row.scheduledAt) >= current,
    ),
    past: rows.filter((row) => row.status !== 'scheduled' || Date.parse(row.scheduledAt) < current),
  };
}

export function safeExternalMeetingHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
