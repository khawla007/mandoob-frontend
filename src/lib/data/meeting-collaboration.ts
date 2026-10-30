import 'server-only';

import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type Purpose = 'recording' | 'transcription' | 'ai_summary';
type ConsentRow = {
  purpose: Purpose;
  granted: boolean;
  withdrawn_at: string | null;
  captured_at: string;
};

export type MeetingNote = {
  id: string;
  body: string;
  visibility: 'internal' | 'participants';
  createdAt: string;
};

export type MeetingActionReview = {
  id: string;
  title: string;
  state: 'proposed' | 'accepted' | 'completed' | 'dismissed';
  priority: 'low' | 'medium' | 'high';
  ownerLabel: string | null;
  dueDate: string | null;
};

export type MeetingCollaboration = {
  consentGranted: boolean;
  notes: MeetingNote[];
  actions: MeetingActionReview[];
};

export function reduceConsentState(rows: readonly ConsentRow[]): boolean {
  const latest = new Map<Purpose, ConsentRow>();
  for (const row of [...rows].sort((a, b) => b.captured_at.localeCompare(a.captured_at))) {
    if (!latest.has(row.purpose)) latest.set(row.purpose, row);
  }
  return (['recording', 'transcription', 'ai_summary'] as const).every((purpose) => {
    const row = latest.get(purpose);
    return row?.granted === true && row.withdrawn_at === null;
  });
}

export async function listMeetingCollaboration(
  meetingIds: string[],
  actorId: string,
  includeInternal: boolean,
): Promise<Map<string, MeetingCollaboration>> {
  if (!meetingIds.length) return new Map();
  const admin = createSupabaseServiceRoleClient();
  const [consentsResult, notesResult, actionsResult] = await Promise.all([
    admin
      .from('meeting_consents')
      .select('meeting_id,purpose,granted,withdrawn_at,captured_at')
      .in('meeting_id', meetingIds)
      .eq('participant_profile_id', actorId)
      .order('captured_at', { ascending: false }),
    (() => {
      let query = admin
        .from('meeting_notes')
        .select('id,meeting_id,body,visibility,created_at')
        .in('meeting_id', meetingIds)
        .order('created_at', { ascending: false });
      if (!includeInternal) query = query.eq('visibility', 'participants');
      return query;
    })(),
    (() => {
      let query = admin
        .from('meeting_action_items')
        .select('id,meeting_id,title,state,priority,owner_label,due_date')
        .in('meeting_id', meetingIds)
        .order('created_at', { ascending: true });
      if (!includeInternal) query = query.in('state', ['accepted', 'completed']);
      return query;
    })(),
  ]);
  const error = consentsResult.error ?? notesResult.error ?? actionsResult.error;
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return new Map(
    meetingIds.map((meetingId) => {
      const consents = (consentsResult.data ?? []).filter((row) => row.meeting_id === meetingId);
      const notes = (notesResult.data ?? [])
        .filter((row) => row.meeting_id === meetingId)
        .map((row) => ({
          id: row.id,
          body: row.body,
          visibility: row.visibility as MeetingNote['visibility'],
          createdAt: row.created_at,
        }));
      const actions = (actionsResult.data ?? [])
        .filter((row) => row.meeting_id === meetingId)
        .map((row) => ({
          id: row.id,
          title: row.title,
          state: row.state as MeetingActionReview['state'],
          priority: row.priority as MeetingActionReview['priority'],
          ownerLabel: row.owner_label,
          dueDate: row.due_date,
        }));
      return [
        meetingId,
        {
          consentGranted: reduceConsentState(consents as ConsentRow[]),
          notes,
          actions,
        },
      ];
    }),
  );
}
