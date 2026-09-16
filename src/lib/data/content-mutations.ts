import 'server-only';

import { z } from 'zod';
import { ApiError } from '@/lib/errors';

export type EditorialEntityType = 'cms_page' | 'blog_post' | 'blog_term' | 'blog_media';
export type EditorialAction = 'create' | 'update' | 'delete';
export type EditorialMutationInput = {
  actorId: string;
  operationId: string;
  entityType: EditorialEntityType;
  action: EditorialAction;
  entityId?: string | null;
  expectedVersion?: number | null;
  payload: Record<string, unknown>;
};
type MutationClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>;
};
type Dependencies = { client?: MutationClient };

const resultSchema = z
  .object({
    id: z.string().uuid(),
    row_version: z.number().int().positive(),
    slug: z.string().optional(),
    public_url: z.string().url().optional(),
  })
  .strict();

async function serviceRoleClient(): Promise<MutationClient> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  return createSupabaseServiceRoleClient() as unknown as MutationClient;
}

export async function mutateEditorialContent(
  input: EditorialMutationInput,
  deps: Dependencies = {},
): Promise<{ id: string; rowVersion: number; slug?: string; publicUrl?: string }> {
  const client = deps.client ?? (await serviceRoleClient());
  const { data, error } = await client.rpc('mutate_editorial_content', {
    p_actor_id: input.actorId,
    p_operation_id: input.operationId,
    p_entity_type: input.entityType,
    p_action: input.action,
    p_entity_id: input.entityId ?? null,
    p_expected_version: input.expectedVersion ?? null,
    p_payload: input.payload,
  });
  if (error) throw mutationError(error.message ?? '');
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError('CONTENT_MUTATION_FAILED', 'Could not apply content mutation', 500);
  }
  return {
    id: parsed.data.id,
    rowVersion: parsed.data.row_version,
    ...(parsed.data.slug ? { slug: parsed.data.slug } : {}),
    ...(parsed.data.public_url ? { publicUrl: parsed.data.public_url } : {}),
  };
}

function mutationError(message: string): ApiError {
  if (message.includes('stale_version'))
    return new ApiError('CONFLICT', 'This content changed. Refresh and try again.', 409);
  if (message.includes('operation_id_conflict'))
    return new ApiError('OPERATION_ID_CONFLICT', 'This operation ID was already used', 409);
  if (message.includes('not_found')) return new ApiError('NOT_FOUND', 'Content not found', 404);
  if (message.includes('duplicate key'))
    return new ApiError('DUPLICATE_SLUG', 'This slug is already in use', 409);
  if (message.includes('forbidden')) return new ApiError('FORBIDDEN', 'Forbidden', 403);
  return new ApiError('CONTENT_MUTATION_FAILED', 'Could not apply content mutation', 500);
}
