import assert from 'node:assert/strict';
import test from 'node:test';

import { createMeetingCommands } from './commands';

const IDS = {
  actor: '11111111-1111-4111-8111-111111111111',
  company: '22222222-2222-4222-8222-222222222222',
  meeting: '33333333-3333-4333-8333-333333333333',
  operation: '44444444-4444-4444-8444-444444444444',
  slot: '55555555-5555-4555-8555-555555555555',
  tenant: '66666666-6666-4666-8666-666666666666',
};

test('booking command sends stable replay identity and expected slot version to the RPC', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const commands = createMeetingCommands({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { meeting_id: IDS.meeting, version: 1, room_state: 'pending' }, error: null };
    },
  } as never);
  const receipt = await commands.book({
    actorId: IDS.actor,
    operationId: IDS.operation,
    tenantId: IDS.tenant,
    companyId: IDS.company,
    slotId: IDS.slot,
    expectedVersion: 2,
    title: 'Consultation',
  });
  assert.equal(receipt.meetingId, IDS.meeting);
  assert.equal(calls[0]?.name, 'p311_book_meeting');
  assert.equal(calls[0]?.args.p_expected_version, 2);
  assert.match(String(calls[0]?.args.p_payload_hash), /^[a-f0-9]{64}$/u);
});

test('slot creation is replay-safe and company scoped', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const commands = createMeetingCommands({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { slot_id: IDS.slot, version: 1 }, error: null };
    },
  } as never);
  const receipt = await commands.createSlot({
    actorId: IDS.actor,
    operationId: IDS.operation,
    tenantId: IDS.tenant,
    companyId: IDS.company,
    startsAt: '2026-11-01T09:00:00.000+04:00',
    endsAt: '2026-11-01T09:30:00.000+04:00',
  });
  assert.equal(receipt.slotId, IDS.slot);
  assert.equal(calls[0]?.name, 'p311_create_slot');
  assert.equal(calls[0]?.args.p_company_id, IDS.company);
  assert.match(String(calls[0]?.args.p_payload_hash), /^[a-f0-9]{64}$/u);
});

test('mutation commands expose safe conflicts instead of raw database errors', async () => {
  const commands = createMeetingCommands({
    rpc: async () => ({ data: null, error: { message: 'private row dump', code: '40001' } }),
  } as never);
  await assert.rejects(
    commands.cancel({
      actorId: IDS.actor,
      operationId: IDS.operation,
      meetingId: IDS.meeting,
      expectedVersion: 1,
    }),
    (error: unknown) =>
      error instanceof Error && error.message === 'Meeting changed. Reload and retry.',
  );
});
