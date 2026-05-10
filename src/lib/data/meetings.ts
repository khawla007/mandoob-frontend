import 'server-only';
import { ApiError } from '@/lib/errors';
import { createDailyRoom } from '@/lib/meetings/daily';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

type SupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'recording_ready';
export type MeetingSlotStatus = 'open' | 'booked' | 'cancelled';
export type MeetingActorRole = 'super_admin' | 'admin' | 'pro' | 'customer';

export type MeetingActor = {
  id: string;
  role: MeetingActorRole;
  tenantId: string | null;
};

export type MeetingSlot = {
  id: string;
  tenantId: string;
  createdBy: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: MeetingSlotStatus;
};

export type Meeting = {
  id: string;
  tenantId: string;
  leadId: string | null;
  clientId: string | null;
  customerProfileId: string | null;
  title: string;
  status: MeetingStatus;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  providerRoomName: string | null;
  meetingUrl: string | null;
  recordingStoragePath: string | null;
  recordingUrl: string | null;
  recordingReadyAt: string | null;
};

export type MeetingDeps = {
  supabase?: SupabaseClient;
  createRoom?: typeof createDailyRoom;
};

type MeetingSlotRow = {
  id: string;
  tenant_id: string;
  created_by: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: MeetingSlotStatus;
};

type MeetingRow = {
  id: string;
  tenant_id: string;
  lead_id?: string | null;
  client_id?: string | null;
  customer_profile_id?: string | null;
  title: string;
  status: MeetingStatus;
  scheduled_at: string;
  duration_minutes?: number;
  timezone?: string;
  provider_room_name?: string | null;
  meeting_url?: string | null;
  recording_storage_path?: string | null;
  recording_url?: string | null;
  recording_ready_at?: string | null;
};

function client(deps: MeetingDeps = {}) {
  return deps.supabase ?? createSupabaseServiceRoleClient();
}

function authorizeTenant(actor: MeetingActor, tenantId: string): void {
  if (actor.role === 'super_admin' || actor.role === 'admin') return;
  if (!actor.tenantId || actor.tenantId !== tenantId) {
    throw new ApiError('FORBIDDEN', 'Meeting belongs to a different tenant', 403);
  }
}

function toSlot(row: MeetingSlotRow): MeetingSlot {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
  };
}

function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    leadId: row.lead_id ?? null,
    clientId: row.client_id ?? null,
    customerProfileId: row.customer_profile_id ?? null,
    title: row.title,
    status: row.status,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes ?? 30,
    timezone: row.timezone ?? 'Asia/Dubai',
    providerRoomName: row.provider_room_name ?? null,
    meetingUrl: row.meeting_url ?? null,
    recordingStoragePath: row.recording_storage_path ?? null,
    recordingUrl: row.recording_url ?? null,
    recordingReadyAt: row.recording_ready_at ?? null,
  };
}

export async function createMeetingSlot(
  input: {
    tenantId: string;
    startsAt: string;
    endsAt: string;
    timezone?: string;
  },
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<MeetingSlot> {
  authorizeTenant(actor, input.tenantId);
  if (actor.role !== 'pro' && actor.role !== 'admin' && actor.role !== 'super_admin') {
    throw new ApiError('FORBIDDEN', 'Only PRO users can create meeting slots', 403);
  }
  if (new Date(input.startsAt).getTime() >= new Date(input.endsAt).getTime()) {
    throw new ApiError('INVALID_SLOT', 'Slot end must be after slot start', 400);
  }

  const { data, error } = await client(deps)
    .from('meeting_slots')
    .insert({
      tenant_id: input.tenantId,
      created_by: actor.id,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      timezone: input.timezone ?? 'Asia/Dubai',
      status: 'open',
    })
    .select('id, tenant_id, created_by, starts_at, ends_at, timezone, status')
    .single();
  if (error || !data) throw new ApiError('INTERNAL', error?.message ?? 'Could not create meeting slot', 500);

  await recordAudit(client(deps), input.tenantId, actor.id, 'meeting_slot_created', {
    slot_id: (data as MeetingSlotRow).id,
  });
  return toSlot(data as MeetingSlotRow);
}

export async function listOpenMeetingSlots(
  tenantId: string,
  from: string,
  to: string,
  deps: MeetingDeps = {},
): Promise<MeetingSlot[]> {
  const { data, error } = await client(deps)
    .from('meeting_slots')
    .select('id, tenant_id, created_by, starts_at, ends_at, timezone, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as MeetingSlotRow[] | null) ?? []).map(toSlot);
}

export async function bookMeetingSlot(
  slotId: string,
  input: {
    tenantId: string;
    customerProfileId?: string | null;
    leadId?: string | null;
    clientId?: string | null;
    title?: string;
  },
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<Meeting> {
  authorizeTenant(actor, input.tenantId);
  const admin = client(deps);
  const { data: slot, error: slotError } = await admin
    .from('meeting_slots')
    .select('id, tenant_id, created_by, starts_at, ends_at, timezone, status')
    .eq('id', slotId)
    .maybeSingle();
  if (slotError) throw new ApiError('INTERNAL', slotError.message, 500);
  if (!slot) throw new ApiError('NOT_FOUND', 'Meeting slot not found', 404);

  const slotRow = slot as MeetingSlotRow;
  authorizeTenant(actor, slotRow.tenant_id);
  if (slotRow.status !== 'open') {
    throw new ApiError('SLOT_ALREADY_BOOKED', 'Meeting slot is already booked', 409);
  }

  const durationMinutes = Math.max(
    1,
    Math.round((new Date(slotRow.ends_at).getTime() - new Date(slotRow.starts_at).getTime()) / 60000),
  );
  const { data: created, error: createError } = await admin
    .from('meetings')
    .insert({
      tenant_id: slotRow.tenant_id,
      lead_id: input.leadId ?? null,
      client_id: input.clientId ?? null,
      customer_profile_id: input.customerProfileId ?? (actor.role === 'customer' ? actor.id : null),
      created_by: actor.id,
      title: input.title ?? 'Consultation',
      status: 'scheduled',
      scheduled_at: slotRow.starts_at,
      duration_minutes: durationMinutes,
      timezone: slotRow.timezone,
      provider: 'daily',
      consent_notice_shown_at: new Date().toISOString(),
    })
    .select('id, tenant_id, lead_id, client_id, customer_profile_id, title, status, scheduled_at, duration_minutes, timezone, provider_room_name, meeting_url, recording_storage_path, recording_url, recording_ready_at')
    .single();
  if (createError || !created) throw new ApiError('INTERNAL', createError?.message ?? 'Could not book meeting', 500);

  const meeting = created as MeetingRow;
  const roomFactory = deps.createRoom ?? createDailyRoom;
  const room = await roomFactory({
    meetingId: meeting.id,
    startsAt: slotRow.starts_at,
    durationMinutes,
  });

  const { error: meetingUpdateError } = await admin
    .from('meetings')
    .update({ provider_room_name: room.name, meeting_url: room.url })
    .eq('id', meeting.id);
  if (meetingUpdateError) throw new ApiError('INTERNAL', meetingUpdateError.message, 500);

  const { error: slotUpdateError } = await admin.from('meeting_slots').update({ status: 'booked' }).eq('id', slotId);
  if (slotUpdateError) throw new ApiError('INTERNAL', slotUpdateError.message, 500);

  await recordAudit(admin, slotRow.tenant_id, actor.id, 'meeting_scheduled', {
    meeting_id: meeting.id,
    slot_id: slotId,
  });

  if (input.leadId) {
    await admin.from('lead_events').insert({
      lead_id: input.leadId,
      tenant_id: slotRow.tenant_id,
      actor_id: actor.id,
      event_type: 'lead_note_added',
      note: `Meeting scheduled for ${slotRow.starts_at}`,
    });
  }

  return toMeeting({ ...meeting, provider_room_name: room.name, meeting_url: room.url });
}

export async function listMeetingsForLead(
  leadId: string,
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<Meeting[]> {
  const admin = client(deps);
  let query = admin.from('meetings').select(MEETING_COLUMNS).eq('lead_id', leadId);
  if (actor.role === 'pro') query = query.eq('tenant_id', actor.tenantId);
  const { data, error } = await query.order('scheduled_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as MeetingRow[] | null) ?? []).map(toMeeting);
}

export async function listMeetingsForClient(
  clientId: string,
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<Meeting[]> {
  const admin = client(deps);
  let query = admin.from('meetings').select(MEETING_COLUMNS).eq('client_id', clientId);
  if (actor.role === 'pro') query = query.eq('tenant_id', actor.tenantId);
  const { data, error } = await query.order('scheduled_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as MeetingRow[] | null) ?? []).map(toMeeting);
}

export async function listMeetingsForCustomer(
  profileId: string,
  deps: MeetingDeps = {},
): Promise<Meeting[]> {
  const { data, error } = await client(deps)
    .from('meetings')
    .select(MEETING_COLUMNS)
    .eq('customer_profile_id', profileId)
    .order('scheduled_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as MeetingRow[] | null) ?? []).map(toMeeting);
}

export async function listMeetingsForTenant(
  tenantId: string,
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<Meeting[]> {
  authorizeTenant(actor, tenantId);
  const { data, error } = await client(deps)
    .from('meetings')
    .select(MEETING_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('scheduled_at', { ascending: false })
    .limit(200);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return ((data as MeetingRow[] | null) ?? []).map(toMeeting);
}

export async function cancelMeeting(
  meetingId: string,
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<void> {
  const admin = client(deps);
  const meeting = await readMeeting(admin, meetingId);
  authorizeTenant(actor, meeting.tenant_id);
  if (meeting.status === 'cancelled') return;
  const { error } = await admin.from('meetings').update({ status: 'cancelled' }).eq('id', meetingId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  await recordAudit(admin, meeting.tenant_id, actor.id, 'meeting_cancelled', { meeting_id: meetingId });
}

export async function attachMeetingRecording(
  meetingId: string,
  recording: { storagePath: string; recordingUrl?: string | null },
  deps: MeetingDeps = {},
): Promise<void> {
  const admin = client(deps);
  const meeting = await readMeeting(admin, meetingId);
  const { error } = await admin
    .from('meetings')
    .update({
      status: 'recording_ready',
      recording_storage_path: recording.storagePath,
      recording_url: recording.recordingUrl ?? null,
      recording_ready_at: new Date().toISOString(),
    })
    .eq('id', meetingId);
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  await recordAudit(admin, meeting.tenant_id, null, 'meeting_recording_attached', { meeting_id: meetingId });
}

export async function findMeetingByDailyRoom(
  roomName: string,
  deps: MeetingDeps = {},
): Promise<Meeting | null> {
  const { data, error } = await client(deps)
    .from('meetings')
    .select(MEETING_COLUMNS)
    .eq('provider_room_name', roomName)
    .maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  return data ? toMeeting(data as MeetingRow) : null;
}

export async function getMeetingRecordingSignedUrl(
  meetingId: string,
  actor: MeetingActor,
  deps: MeetingDeps = {},
): Promise<string | null> {
  const admin = client(deps);
  const meeting = await readMeeting(admin, meetingId);
  if (actor.role === 'customer') {
    if (meeting.customer_profile_id !== actor.id) {
      throw new ApiError('FORBIDDEN', 'Recording belongs to a different customer', 403);
    }
  } else {
    authorizeTenant(actor, meeting.tenant_id);
  }
  if (!meeting.recording_storage_path) return null;

  const { data, error } = await admin.storage
    .from('tenant-meetings')
    .createSignedUrl(meeting.recording_storage_path, 300);
  if (error) throw new ApiError('STORAGE_SIGN_FAILED', error.message, 502);
  return data.signedUrl;
}

const MEETING_COLUMNS =
  'id, tenant_id, lead_id, client_id, customer_profile_id, title, status, scheduled_at, duration_minutes, timezone, provider_room_name, meeting_url, recording_storage_path, recording_url, recording_ready_at';

async function readMeeting(admin: SupabaseClient, meetingId: string): Promise<MeetingRow> {
  const { data, error } = await admin.from('meetings').select(MEETING_COLUMNS).eq('id', meetingId).maybeSingle();
  if (error) throw new ApiError('INTERNAL', error.message, 500);
  if (!data) throw new ApiError('NOT_FOUND', 'Meeting not found', 404);
  return data as MeetingRow;
}

async function recordAudit(
  admin: SupabaseClient,
  tenantId: string,
  actorId: string | null,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('tenant_audit_log').insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action,
    source: actorId ? 'self_serve' : 'system',
    details: { entity: 'meeting', ...details },
  });
  if (error) throw new ApiError('INTERNAL', error.message, 500);
}
