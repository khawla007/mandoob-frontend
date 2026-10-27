import { z } from 'zod';
import { ApiError } from '@/lib/errors';

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const uuid = z.string().uuid();

async function command(client: RpcClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw new ApiError('MEETING_COLLABORATION_FAILED', 'Meeting could not be updated.', 400);
  return data;
}

export function createMeetingCollaborationCommands(client: RpcClient) {
  return {
    setConsent(input: {
      actorId: string;
      meetingId: string;
      granted: boolean;
      policyVersion: string;
    }) {
      return command(client, 'p311_set_consent', {
        p_actor_id: uuid.parse(input.actorId),
        p_meeting_id: uuid.parse(input.meetingId),
        p_granted: input.granted,
        p_policy_version: z.string().trim().min(1).max(80).parse(input.policyVersion),
      });
    },
    addNote(input: {
      actorId: string;
      meetingId: string;
      body: string;
      visibility: 'internal' | 'participants';
    }) {
      return command(client, 'p311_add_meeting_note', {
        p_actor_id: uuid.parse(input.actorId),
        p_meeting_id: uuid.parse(input.meetingId),
        p_body: z.string().trim().min(1).max(10_000).parse(input.body),
        p_visibility: z.enum(['internal', 'participants']).parse(input.visibility),
      });
    },
    reviewAction(input: {
      actorId: string;
      meetingId: string;
      actionItemId: string;
      decision: 'accepted' | 'dismissed';
    }) {
      return command(client, 'p311_review_action_item', {
        p_actor_id: uuid.parse(input.actorId),
        p_meeting_id: uuid.parse(input.meetingId),
        p_action_item_id: uuid.parse(input.actionItemId),
        p_decision: z.enum(['accepted', 'dismissed']).parse(input.decision),
      });
    },
  };
}
