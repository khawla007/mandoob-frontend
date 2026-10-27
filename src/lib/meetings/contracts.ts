import { z } from 'zod';

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });

export const meetingCommandSchema = z.object({
  meetingId: uuid,
  operationId: uuid,
  expectedVersion: z.number().int().positive(),
});

export function meetingSlotInputSchema(now = new Date()) {
  return z
    .object({
      startsAt: instant,
      endsAt: instant,
      timezone: z.literal('Asia/Dubai'),
    })
    .superRefine((value, context) => {
      const starts = new Date(value.startsAt).getTime();
      const ends = new Date(value.endsAt).getTime();
      const duration = ends - starts;
      if (starts <= now.getTime()) {
        context.addIssue({ code: 'custom', path: ['startsAt'], message: 'SLOT_MUST_BE_FUTURE' });
      }
      if (duration < 15 * 60_000 || duration > 180 * 60_000) {
        context.addIssue({ code: 'custom', path: ['endsAt'], message: 'SLOT_DURATION_INVALID' });
      }
    });
}

export type OperationalCalendarItem = {
  source: 'meeting' | 'renewal';
  sourceId: string;
  occursAt: string;
  label: string;
  status: string | null;
  href: string | null;
};

type RenewalCalendarItem = { id: string; dueDate: string; label: string };
type MeetingCalendarItem = {
  id: string;
  scheduledAt: string;
  title: string;
  status: string;
  href: string | null;
};

export function composeOperationalCalendar(
  renewals: readonly RenewalCalendarItem[],
  meetings: readonly MeetingCalendarItem[],
): OperationalCalendarItem[] {
  return [
    ...renewals.map((item) => ({
      source: 'renewal' as const,
      sourceId: item.id,
      occursAt: `${item.dueDate}T00:00:00+04:00`,
      label: item.label,
      status: null,
      href: null,
    })),
    ...meetings.map((item) => ({
      source: 'meeting' as const,
      sourceId: item.id,
      occursAt: item.scheduledAt,
      label: item.title,
      status: item.status,
      href: item.href,
    })),
  ].sort(
    (left, right) =>
      left.occursAt.localeCompare(right.occursAt) ||
      left.source.localeCompare(right.source) ||
      left.sourceId.localeCompare(right.sourceId),
  );
}

type MeetingScope = {
  id: string;
  tenantId: string;
  companyId: string | null;
  participantProfileIds: readonly string[];
};

type CalendarActor = {
  actorId: string;
  role: 'super_admin' | 'admin' | 'pro' | 'customer' | 'employee';
  tenantId: string | null;
  companyId: string | null;
};

export function projectMeetingForActor(meeting: MeetingScope, actor: CalendarActor): boolean {
  if (actor.role === 'super_admin' || actor.role === 'admin') return true;
  if (!actor.tenantId || actor.tenantId !== meeting.tenantId) return false;
  if (!actor.companyId || actor.companyId !== meeting.companyId) return false;
  if (actor.role === 'employee') return meeting.participantProfileIds.includes(actor.actorId);
  return actor.role === 'pro' || meeting.participantProfileIds.includes(actor.actorId);
}

type Consent = {
  purpose: 'recording' | 'transcription' | 'ai_summary';
  granted: boolean;
  withdrawnAt: string | null;
};

export function hasProcessingConsent(consents: readonly Consent[]): boolean {
  const required = new Set<Consent['purpose']>(['recording', 'transcription', 'ai_summary']);
  for (const consent of consents) {
    if (consent.granted && consent.withdrawnAt === null) required.delete(consent.purpose);
  }
  return required.size === 0;
}
