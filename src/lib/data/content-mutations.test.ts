import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '@/lib/errors';
import { mutateEditorialContent } from './content-mutations';

const operationId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const entityId = '33333333-3333-4333-8333-333333333333';

test('mutateEditorialContent forwards the complete durable mutation contract', async () => {
  let call: { name: string; args: Record<string, unknown> } | undefined;
  const result = await mutateEditorialContent(
    {
      actorId,
      operationId,
      entityType: 'cms_page',
      action: 'update',
      entityId,
      expectedVersion: 4,
      payload: { slug: 'about' },
    },
    {
      client: {
        async rpc(name, args) {
          call = { name, args };
          return { data: { id: entityId, slug: 'about', row_version: 5 }, error: null };
        },
      },
    },
  );

  assert.deepEqual(call, {
    name: 'mutate_editorial_content',
    args: {
      p_actor_id: actorId,
      p_operation_id: operationId,
      p_entity_type: 'cms_page',
      p_action: 'update',
      p_entity_id: entityId,
      p_expected_version: 4,
      p_payload: { slug: 'about' },
    },
  });
  assert.deepEqual(result, { id: entityId, slug: 'about', rowVersion: 5 });
});

for (const [message, code] of [
  ['stale_version', 'CONFLICT'],
  ['operation_id_conflict', 'OPERATION_ID_CONFLICT'],
  ['not_found', 'NOT_FOUND'],
] as const) {
  test(`maps ${message} without leaking database details`, async () => {
    await assert.rejects(
      () =>
        mutateEditorialContent(
          {
            actorId,
            operationId,
            entityType: 'blog_term',
            action: 'delete',
            entityId,
            expectedVersion: 1,
            payload: {},
          },
          { client: { rpc: async () => ({ data: null, error: { message } }) } },
        ),
      (error: unknown) => error instanceof ApiError && error.code === code,
    );
  });
}
