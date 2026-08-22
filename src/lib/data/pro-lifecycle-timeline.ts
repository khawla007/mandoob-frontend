import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  decodeProTimelineCursor,
  proDecisionReasonCodeSchema,
  proDecisionReasonSchema,
} from '@/lib/validation/pro-lifecycle';

type RpcResult = { data: unknown; error: { message?: string } | null };
type TimelineClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
type TimelineDeps = { supabase?: TimelineClient };

const uuid = z.string().uuid();
const itemSchema = z
  .object({
    eventAt: z.string().datetime({ offset: true }),
    eventId: uuid,
    eventKind: z.enum([
      'credential_submitted',
      'credential_review_started',
      'credential_verified',
      'credential_rejected',
      'credential_expired',
      'credential_revoked',
      'credential_superseded',
      'assignment_assigned',
      'assignment_released',
    ]),
    summaryCode: z.string().regex(/^[A-Z_]+$/u),
    reasonCode: proDecisionReasonCodeSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    reason: proDecisionReasonSchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    actorDisplayName: z.string().nullable(),
    companyDisplayName: z.string().nullable(),
  })
  .strict();
const resultSchema = z.object({ items: z.array(itemSchema) }).strict();

export type ProLifecycleTimelineItem = z.infer<typeof itemSchema>;
export type ProLifecycleTimelinePage = {
  items: ProLifecycleTimelineItem[];
  nextCursor: string | null;
};

function db(deps: TimelineDeps): TimelineClient {
  return deps.supabase ?? (createSupabaseServiceRoleClient() as unknown as TimelineClient);
}

function internal(): ApiError {
  return new ApiError('INTERNAL', 'Unable to load PRO lifecycle timeline', 500);
}

export async function readProLifecycleTimeline(
  actorId: string,
  proProfileId: string,
  limit: number,
  cursor: string | null,
  deps: TimelineDeps = {},
): Promise<ProLifecycleTimelinePage> {
  const parsedLimit = z
    .number()
    .int()
    .min(1, 'Invalid limit')
    .max(100, 'Invalid limit')
    .parse(limit);
  const decoded = cursor === null ? null : decodeProTimelineCursor(cursor);
  const { data, error } = await db(deps).rpc('read_pro_lifecycle_timeline', {
    p_actor_id: uuid.parse(actorId),
    p_pro_profile_id: uuid.parse(proProfileId),
    p_limit: parsedLimit,
    p_cursor_event_at: decoded?.eventAt ?? null,
    p_cursor_event_id: decoded?.eventId ?? null,
  });
  if (error) throw internal();
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success || parsed.data.items.length > parsedLimit) throw internal();
  const last = parsed.data.items.at(-1);
  return {
    items: parsed.data.items,
    nextCursor:
      parsed.data.items.length === parsedLimit && last
        ? Buffer.from(JSON.stringify({ eventAt: last.eventAt, eventId: last.eventId })).toString(
            'base64url',
          )
        : null,
  };
}
