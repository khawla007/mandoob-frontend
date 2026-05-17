import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadMeetings() {
  return import('./meetings');
}

type Row = Record<string, unknown>;

function createSupabaseStub(seed: Record<string, Row[]>) {
  const tables = new Map(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const inserts: Array<{ table: string; payload: Row }> = [];
  const updates: Array<{ table: string; payload: Row; filters: Record<string, unknown> }> = [];

  function rows(table: string) {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  function match(row: Row, filters: Record<string, unknown>) {
    return Object.entries(filters).every(([key, value]) => row[key] === value);
  }

  function filtered(table: string, filters: Record<string, unknown>) {
    return rows(table).filter((row) => match(row, filters));
  }

  return {
    inserts,
    updates,
    tables,
    from(table: string) {
      const state: {
        filters: Record<string, unknown>;
        lte: Record<string, string>;
        gte: Record<string, string>;
        orderKey: string | null;
        ascending: boolean;
        updatePayload: Row | null;
      } = { filters: {}, lte: {}, gte: {}, orderKey: null, ascending: true, updatePayload: null };
      const builder = {
        select: () => builder,
        eq(key: string, value: unknown) {
          state.filters[key] = value;
          return builder;
        },
        is(key: string, value: unknown) {
          state.filters[key] = value;
          return builder;
        },
        gte(key: string, value: string) {
          state.gte[key] = value;
          return builder;
        },
        lte(key: string, value: string) {
          state.lte[key] = value;
          return builder;
        },
        order(key: string, opts?: { ascending?: boolean }) {
          state.orderKey = key;
          state.ascending = opts?.ascending ?? true;
          return builder;
        },
        limit: () => builder,
        update(payload: Row) {
          state.updatePayload = payload;
          return builder;
        },
        insert(payload: Row) {
          inserts.push({ table, payload });
          const row = { id: `${table}-${inserts.length}`, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), ...payload };
          rows(table).push(row);
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
        collect() {
          let result = filtered(table, state.filters);
          for (const [key, value] of Object.entries(state.gte)) result = result.filter((row) => String(row[key]) >= value);
          for (const [key, value] of Object.entries(state.lte)) result = result.filter((row) => String(row[key]) <= value);
          if (state.updatePayload) {
            result.forEach((row) => Object.assign(row, state.updatePayload));
            updates.push({ table, payload: state.updatePayload, filters: { ...state.filters } });
          }
          if (state.orderKey) {
            result.sort((a, b) => {
              const av = String(a[state.orderKey!] ?? '');
              const bv = String(b[state.orderKey!] ?? '');
              return state.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
          }
          return { data: result, error: null };
        },
        async maybeSingle() {
          const result = builder.collect();
          return { data: result.data[0] ?? null, error: null };
        },
        async single() {
          const result = await builder.maybeSingle();
          return result.data ? { data: result.data, error: null } : { data: null, error: { message: 'not found' } };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          resolve(builder.collect());
        },
      };
      return builder;
    },
  };
}

const proActor = { id: 'pro-1', role: 'pro' as const, tenantId: 'tenant-1' };
const customerActor = { id: 'customer-1', role: 'customer' as const, tenantId: 'tenant-1' };

test('PRO creates a future meeting slot for their tenant', async () => {
  const { createMeetingSlot } = await loadMeetings();
  const supabase = createSupabaseStub({ meeting_slots: [] });

  const slot = await createMeetingSlot(
    {
      tenantId: 'tenant-1',
      startsAt: '2026-05-11T08:00:00.000Z',
      endsAt: '2026-05-11T08:30:00.000Z',
      timezone: 'Asia/Dubai',
    },
    proActor,
    { supabase: supabase as never },
  );

  assert.equal(slot.status, 'open');
  assert.equal(supabase.tables.get('meeting_slots')![0].created_by, 'pro-1');
});

test('slot creation rejects cross-tenant PRO writes', async () => {
  const { createMeetingSlot } = await loadMeetings();
  const supabase = createSupabaseStub({ meeting_slots: [] });

  await assert.rejects(
    () =>
      createMeetingSlot(
        {
          tenantId: 'tenant-2',
          startsAt: '2026-05-11T08:00:00.000Z',
          endsAt: '2026-05-11T08:30:00.000Z',
          timezone: 'Asia/Dubai',
        },
        proActor,
        { supabase: supabase as never },
      ),
    /different tenant/,
  );
});

test('customer books an open slot once and gets a Daily meeting URL', async () => {
  const { bookMeetingSlot } = await loadMeetings();
  const supabase = createSupabaseStub({
    meeting_slots: [
      {
        id: 'slot-1',
        tenant_id: 'tenant-1',
        created_by: 'pro-1',
        starts_at: '2026-05-11T08:00:00.000Z',
        ends_at: '2026-05-11T08:30:00.000Z',
        timezone: 'Asia/Dubai',
        status: 'open',
      },
    ],
    meetings: [],
    tenant_audit_log: [],
  });

  const meeting = await bookMeetingSlot(
    'slot-1',
    { tenantId: 'tenant-1', customerProfileId: 'customer-1', title: 'Consultation' },
    customerActor,
    {
      supabase: supabase as never,
      createRoom: async ({ meetingId }) => ({ name: `room-${meetingId}`, url: `https://daily.test/${meetingId}` }),
    },
  );

  assert.equal(meeting.meetingUrl, 'https://daily.test/meetings-1');
  assert.equal(supabase.tables.get('meeting_slots')![0].status, 'booked');
  assert.equal(supabase.tables.get('tenant_audit_log')![0].action, 'meeting_scheduled');
});

test('booking rejects an already booked slot', async () => {
  const { bookMeetingSlot } = await loadMeetings();
  const supabase = createSupabaseStub({
    meeting_slots: [{ id: 'slot-1', tenant_id: 'tenant-1', status: 'booked' }],
  });

  await assert.rejects(
    () =>
      bookMeetingSlot('slot-1', { tenantId: 'tenant-1', customerProfileId: 'customer-1' }, customerActor, {
        supabase: supabase as never,
        createRoom: async () => ({ name: 'room', url: 'https://daily.test/room' }),
      }),
    /already booked/,
  );
});

test('customer meeting list only returns their own meetings', async () => {
  const { listMeetingsForCustomer } = await loadMeetings();
  const supabase = createSupabaseStub({
    meetings: [
      { id: 'meeting-1', tenant_id: 'tenant-1', customer_profile_id: 'customer-1', scheduled_at: '2026-05-11T08:00:00.000Z', title: 'Mine', status: 'scheduled' },
      { id: 'meeting-2', tenant_id: 'tenant-1', customer_profile_id: 'customer-2', scheduled_at: '2026-05-11T09:00:00.000Z', title: 'Other', status: 'scheduled' },
    ],
  });

  const meetings = await listMeetingsForCustomer('customer-1', { supabase: supabase as never });

  assert.deepEqual(meetings.map((meeting) => meeting.id), ['meeting-1']);
});

test('PRO cancels own-tenant meeting and attaches recording metadata', async () => {
  const { cancelMeeting, attachMeetingRecording } = await loadMeetings();
  const supabase = createSupabaseStub({
    meetings: [
      { id: 'meeting-1', tenant_id: 'tenant-1', status: 'scheduled', scheduled_at: '2026-05-11T08:00:00.000Z', title: 'Consultation' },
    ],
    tenant_audit_log: [],
  });

  await cancelMeeting('meeting-1', proActor, { supabase: supabase as never });
  await attachMeetingRecording(
    'meeting-1',
    { storagePath: 'tenant-1/meetings/meeting-1/recording.mp4', recordingUrl: null },
    { supabase: supabase as never },
  );

  const row = supabase.tables.get('meetings')![0];
  assert.equal(row.status, 'recording_ready');
  assert.equal(row.recording_storage_path, 'tenant-1/meetings/meeting-1/recording.mp4');
  assert.deepEqual(
    supabase.tables.get('tenant_audit_log')!.map((entry) => entry.action),
    ['meeting_cancelled', 'meeting_recording_attached'],
  );
});
