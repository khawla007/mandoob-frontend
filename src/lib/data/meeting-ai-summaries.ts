import 'server-only';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { MeetingActor } from '@/lib/data/meetings';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type MeetingAiSummaryStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type MeetingAiSummaryFailureCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RECORDING_NOT_FOUND'
  | 'RECORDING_TOO_LARGE'
  | 'TRANSCRIPTION_FAILED'
  | 'SUMMARY_FAILED'
  | 'INVALID_PROVIDER_OUTPUT'
  | 'INTERNAL';

export const meetingActionItemSchema = z.object({
  title: z.string().trim().min(1).max(180),
  owner_label: z.string().trim().min(1).max(120).nullable(),
  due_date: z.string().trim().min(1).max(40).nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  source_quote: z.string().trim().max(240).nullable(),
});

export const meetingSummaryOutputSchema = z.object({
  transcriptText: z.string().trim().min(1).max(200_000),
  summaryText: z.string().trim().min(1).max(10_000),
  decisions: z.array(z.string().trim().min(1).max(500)).max(25),
  actionItems: z.array(meetingActionItemSchema).max(50),
  risksOrFollowups: z.array(z.string().trim().min(1).max(500)).max(25),
  language: z.string().trim().min(2).max(32),
  provider: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(100),
});

export type MeetingActionItem = z.infer<typeof meetingActionItemSchema>;
export type MeetingSummaryOutput = z.infer<typeof meetingSummaryOutputSchema>;

export type MeetingAiSummary = {
  id: string;
  tenantId: string;
  meetingId: string;
  status: MeetingAiSummaryStatus;
  transcriptText: string | null;
  summaryText: string | null;
  decisions: string[];
  actionItems: MeetingActionItem[];
  risksOrFollowups: string[];
  language: string | null;
  provider: string | null;
  model: string | null;
  errorCode: MeetingAiSummaryFailureCode | null;
  attempts: number;
  customerVisible: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PendingMeetingAiSummary = MeetingAiSummary & {
  recordingStoragePath: string | null;
  recordingUrl: string | null;
};

export type MeetingAiSummaryDeps = {
  supabase?: SupabaseClient;
};

type SummaryRow = {
  id: string;
  tenant_id: string;
  meeting_id: string;
  status: MeetingAiSummaryStatus;
  transcript_text?: string | null;
  summary_text?: string | null;
  decisions?: unknown;
  action_items?: unknown;
  risks_or_followups?: unknown;
  language?: string | null;
  provider?: string | null;
  model?: string | null;
  error_code?: MeetingAiSummaryFailureCode | null;
  attempts?: number | null;
  customer_visible?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  meetings?: {
    recording_storage_path?: string | null;
    recording_url?: string | null;
  } | null;
};

type MeetingRow = {
  id: string;
  tenant_id: string;
  recording_storage_path?: string | null;
  recording_url?: string | null;
};

const SUMMARY_COLUMNS =
  'id, tenant_id, meeting_id, status, transcript_text, summary_text, decisions, action_items, risks_or_followups, language, provider, model, error_code, attempts, customer_visible, created_at, updated_at';
const PENDING_COLUMNS = `${SUMMARY_COLUMNS}, meetings(recording_storage_path, recording_url)`;

function client(deps: MeetingAiSummaryDeps = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

function authorizeTenant(actor: MeetingActor, tenantId: string): void {
  if (actor.role === 'super_admin' || actor.role === 'admin') return;
  if (actor.role !== 'pro' || !actor.tenantId || actor.tenantId !== tenantId) {
    throw new ApiError('FORBIDDEN', 'Meeting summary belongs to a different tenant', 403);
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asActionItems(value: unknown): MeetingActionItem[] {
  const parsed = z.array(meetingActionItemSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function toSummary(row: SummaryRow): MeetingAiSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    meetingId: row.meeting_id,
    status: row.status,
    transcriptText: row.transcript_text ?? null,
    summaryText: row.summary_text ?? null,
    decisions: asStringArray(row.decisions),
    actionItems: asActionItems(row.action_items),
    risksOrFollowups: asStringArray(row.risks_or_followups),
    language: row.language ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    errorCode: row.error_code ?? null,
    attempts: row.attempts ?? 0,
    customerVisible: row.customer_visible ?? false,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function toPending(row: SummaryRow): PendingMeetingAiSummary {
  const summary = toSummary(row);
  return {
    ...summary,
    recordingStoragePath: row.meetings?.recording_storage_path ?? null,
    recordingUrl: row.meetings?.recording_url ?? null,
  };
}

async function readMeeting(admin: SupabaseClient, meetingId: string): Promise<MeetingRow> {
  const { data, error } = await admin
    .from('meetings')
    .select('id, tenant_id, recording_storage_path, recording_url')
    .eq('id', meetingId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Meeting not found', 404);
  return data as MeetingRow;
}

async function readSummaryByMeeting(admin: SupabaseClient, meetingId: string): Promise<SummaryRow | null> {
  const { data, error } = await admin
    .from('meeting_ai_summaries')
    .select(SUMMARY_COLUMNS)
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return (data as SummaryRow | null) ?? null;
}

export async function ensurePendingMeetingAiSummary(
  meetingId: string,
  deps: MeetingAiSummaryDeps = {},
): Promise<MeetingAiSummary> {
  const admin = client(deps);
  const existing = await readSummaryByMeeting(admin, meetingId);
  if (existing) return toSummary(existing);

  const meeting = await readMeeting(admin, meetingId);
  const { data, error } = await admin
    .from('meeting_ai_summaries')
    .insert({
      tenant_id: meeting.tenant_id,
      meeting_id: meeting.id,
      status: 'pending',
      attempts: 0,
      customer_visible: false,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error || !data) throw new ApiError('INTERNAL', error?.message ?? 'Could not create meeting summary', 500);
  return toSummary(data as SummaryRow);
}

export async function getMeetingAiSummaryForMeeting(
  meetingId: string,
  actor: MeetingActor,
  deps: MeetingAiSummaryDeps = {},
): Promise<MeetingAiSummary | null> {
  const admin = client(deps);
  const meeting = await readMeeting(admin, meetingId);
  authorizeTenant(actor, meeting.tenant_id);
  const summary = await readSummaryByMeeting(admin, meetingId);
  return summary ? toSummary(summary) : null;
}

export async function listMeetingAiSummariesForMeetings(
  meetingIds: string[],
  actor: MeetingActor,
  deps: MeetingAiSummaryDeps = {},
): Promise<Map<string, MeetingAiSummary>> {
  if (!meetingIds.length) return new Map();
  const admin = client(deps);
  const { data, error } = await admin
    .from('meeting_ai_summaries')
    .select(SUMMARY_COLUMNS)
    .in('meeting_id', meetingIds);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  const summaries = ((data as SummaryRow[] | null) ?? []).map(toSummary);
  summaries.forEach((summary) => authorizeTenant(actor, summary.tenantId));
  return new Map(summaries.map((summary) => [summary.meetingId, summary]));
}

export async function listPendingMeetingAiSummaries(
  limit = 5,
  deps: MeetingAiSummaryDeps = {},
): Promise<PendingMeetingAiSummary[]> {
  const admin = client(deps);
  const { data, error } = await admin
    .from('meeting_ai_summaries')
    .select(PENDING_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)));
  if (error) throw new ApiError('INTERNAL', error.message, 500);

  const rows = (data as SummaryRow[] | null) ?? [];
  await Promise.all(
    rows.map((row) =>
      admin
        .from('meeting_ai_summaries')
        .update({
          status: 'processing',
          attempts: (row.attempts ?? 0) + 1,
          error_code: null,
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id),
    ),
  );
  return rows.map((row) => toPending({ ...row, status: 'processing', attempts: (row.attempts ?? 0) + 1 }));
}

export async function completeMeetingAiSummary(
  summaryId: string,
  output: MeetingSummaryOutput,
  deps: MeetingAiSummaryDeps = {},
): Promise<void> {
  const parsed = meetingSummaryOutputSchema.safeParse(output);
  if (!parsed.success) throw new ApiError('INVALID_PROVIDER_OUTPUT', 'Meeting summary output is invalid', 502);
  const value = parsed.data;
  const { error } = await client(deps)
    .from('meeting_ai_summaries')
    .update({
      status: 'completed',
      transcript_text: value.transcriptText,
      summary_text: value.summaryText,
      decisions: value.decisions,
      action_items: value.actionItems,
      risks_or_followups: value.risksOrFollowups,
      language: value.language,
      provider: value.provider,
      model: value.model,
      error_code: null,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', summaryId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
}

export async function failMeetingAiSummary(
  summaryId: string,
  errorCode: MeetingAiSummaryFailureCode,
  deps: MeetingAiSummaryDeps = {},
): Promise<void> {
  const { error } = await client(deps)
    .from('meeting_ai_summaries')
    .update({
      status: 'failed',
      error_code: errorCode,
      error: errorCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', summaryId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
}

export async function retryMeetingAiSummary(
  meetingId: string,
  actor: MeetingActor,
  deps: MeetingAiSummaryDeps = {},
): Promise<MeetingAiSummary> {
  const admin = client(deps);
  const meeting = await readMeeting(admin, meetingId);
  authorizeTenant(actor, meeting.tenant_id);
  const existing = await readSummaryByMeeting(admin, meetingId);
  if (!existing) return ensurePendingMeetingAiSummary(meetingId, deps);

  const { data, error } = await admin
    .from('meeting_ai_summaries')
    .update({
      status: 'pending',
      error_code: null,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(SUMMARY_COLUMNS)
    .single();
  if (error || !data) throw new ApiError('INTERNAL', error?.message ?? 'Could not retry meeting summary', 500);
  return toSummary(data as SummaryRow);
}
