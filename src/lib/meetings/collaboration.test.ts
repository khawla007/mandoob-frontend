import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeetingCollaborationCommands } from './collaboration';

test('consent, note, and action review commands use scoped RPC inputs', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const commands = createMeetingCollaborationCommands({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: true, error: null };
    },
  });
  const actorId = '11111111-1111-4111-8111-111111111111';
  const meetingId = '22222222-2222-4222-8222-222222222222';
  await commands.setConsent({ actorId, meetingId, granted: true, policyVersion: 'p3.11-v1' });
  await commands.addNote({
    actorId,
    meetingId,
    body: 'Send the final checklist.',
    visibility: 'participants',
  });
  await commands.reviewAction({
    actorId,
    meetingId,
    actionItemId: '33333333-3333-4333-8333-333333333333',
    decision: 'accepted',
  });
  assert.deepEqual(
    calls.map(({ name }) => name),
    ['p311_set_consent', 'p311_add_meeting_note', 'p311_review_action_item'],
  );
  assert.equal(calls[0]?.args.p_policy_version, 'p3.11-v1');
  assert.equal(calls[1]?.args.p_body, 'Send the final checklist.');
  assert.equal(calls[2]?.args.p_decision, 'accepted');
});

test('collaboration commands reject empty notes before RPC', () => {
  const commands = createMeetingCollaborationCommands({
    rpc: async () => ({ data: true, error: null }),
  });
  assert.throws(() =>
    commands.addNote({
      actorId: '11111111-1111-4111-8111-111111111111',
      meetingId: '22222222-2222-4222-8222-222222222222',
      body: ' ',
      visibility: 'internal',
    }),
  );
});
