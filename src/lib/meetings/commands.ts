import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '@/lib/errors';

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

const uuid = z.string().uuid();
const receiptSchema = z.object({
  meeting_id: uuid,
  version: z.number().int().positive(),
  room_state: z.enum(['pending', 'ready', 'compensation_pending', 'cancelled']),
});
const slotReceiptSchema = z.object({
  slot_id: uuid,
  version: z.number().int().positive(),
});

export type MeetingCommandReceipt = {
  meetingId: string;
  version: number;
  roomState: z.infer<typeof receiptSchema>['room_state'];
};

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function run(client: RpcClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.code === '40001' || error.code === '23505') {
      throw new ApiError('MEETING_CONFLICT', 'Meeting changed. Reload and retry.', 409);
    }
    if (error.code === '42501' || error.code === 'P0002') {
      throw new ApiError('MEETING_UNAVAILABLE', 'Meeting is not available.', 404);
    }
    throw new ApiError('MEETING_COMMAND_FAILED', 'Meeting could not be updated.', 500);
  }
  const receipt = receiptSchema.parse(data);
  return {
    meetingId: receipt.meeting_id,
    version: receipt.version,
    roomState: receipt.room_state,
  } satisfies MeetingCommandReceipt;
}

export function createMeetingCommands(client: RpcClient) {
  return {
    async createSlot(input: {
      actorId: string;
      operationId: string;
      tenantId: string;
      companyId: string;
      startsAt: string;
      endsAt: string;
    }) {
      const payload = {
        startsAt: z.string().datetime({ offset: true }).parse(input.startsAt),
        endsAt: z.string().datetime({ offset: true }).parse(input.endsAt),
      };
      const { data, error } = await client.rpc('p311_create_slot', {
        p_actor_id: uuid.parse(input.actorId),
        p_operation_id: uuid.parse(input.operationId),
        p_payload_hash: hash(payload),
        p_tenant_id: uuid.parse(input.tenantId),
        p_company_id: uuid.parse(input.companyId),
        p_starts_at: payload.startsAt,
        p_ends_at: payload.endsAt,
      });
      if (error) {
        if (error.code === '23505' || error.code === '23P01' || error.code === '40001') {
          throw new ApiError('MEETING_CONFLICT', 'Meeting slot conflicts with availability.', 409);
        }
        throw new ApiError('MEETING_COMMAND_FAILED', 'Meeting slot could not be created.', 500);
      }
      const receipt = slotReceiptSchema.parse(data);
      return { slotId: receipt.slot_id, version: receipt.version };
    },
    book(input: {
      actorId: string;
      operationId: string;
      tenantId: string;
      companyId: string;
      slotId: string;
      expectedVersion: number;
      title: string;
    }) {
      const payload = {
        slotId: uuid.parse(input.slotId),
        expectedVersion: input.expectedVersion,
        title: input.title.trim(),
      };
      return run(client, 'p311_book_meeting', {
        p_actor_id: uuid.parse(input.actorId),
        p_operation_id: uuid.parse(input.operationId),
        p_payload_hash: hash(payload),
        p_tenant_id: uuid.parse(input.tenantId),
        p_company_id: uuid.parse(input.companyId),
        p_slot_id: payload.slotId,
        p_expected_version: z.number().int().positive().parse(payload.expectedVersion),
        p_title: z.string().min(1).max(180).parse(payload.title),
      });
    },
    reschedule(input: {
      actorId: string;
      operationId: string;
      meetingId: string;
      expectedVersion: number;
      startsAt: string;
      endsAt: string;
    }) {
      const payload = {
        meetingId: uuid.parse(input.meetingId),
        expectedVersion: input.expectedVersion,
        startsAt: z.string().datetime({ offset: true }).parse(input.startsAt),
        endsAt: z.string().datetime({ offset: true }).parse(input.endsAt),
      };
      return run(client, 'p311_reschedule_meeting', {
        p_actor_id: uuid.parse(input.actorId),
        p_operation_id: uuid.parse(input.operationId),
        p_payload_hash: hash(payload),
        p_meeting_id: payload.meetingId,
        p_expected_version: z.number().int().positive().parse(payload.expectedVersion),
        p_starts_at: payload.startsAt,
        p_ends_at: payload.endsAt,
      });
    },
    cancel(input: {
      actorId: string;
      operationId: string;
      meetingId: string;
      expectedVersion: number;
    }) {
      const payload = {
        meetingId: uuid.parse(input.meetingId),
        expectedVersion: input.expectedVersion,
      };
      return run(client, 'p311_cancel_meeting', {
        p_actor_id: uuid.parse(input.actorId),
        p_operation_id: uuid.parse(input.operationId),
        p_payload_hash: hash(payload),
        p_meeting_id: payload.meetingId,
        p_expected_version: z.number().int().positive().parse(payload.expectedVersion),
      });
    },
  };
}
