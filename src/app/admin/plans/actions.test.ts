import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runActivateCatalogAction,
  runCloneCatalogAction,
  runEditCatalogAction,
  type AdminPlanActionDependencies,
} from './action-logic';

const actorId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const nextVersionId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';

function deps(aal: 'aal1' | 'aal2' = 'aal2') {
  const calls: string[] = [];
  const value: AdminPlanActionDependencies = {
    requireActor: async () => ({ id: actorId, aal }),
    clone: async (input) => (
      calls.push(`clone:${input.reviewReference}`),
      { ok: true, versionId: nextVersionId, replayed: false }
    ),
    edit: async (input) => (
      calls.push(`edit:${input.reviewReference}:${input.expectedRevision}`),
      { ok: true, versionId, replayed: false }
    ),
    activate: async (input) => (
      calls.push(`activate:${input.reviewReference}:${input.effectiveFrom}`),
      { ok: true, versionId, replayed: false }
    ),
    revalidate: (path) => calls.push(`revalidate:${path}`),
  };
  return { calls, value };
}

test('draft clone/edit/activate require AAL2 and review reference', async () => {
  const denied = deps('aal1');
  assert.deepEqual(
    await runCloneCatalogAction(
      { sourceVersionId: versionId, operationId, reviewReference: 'FIN-42' },
      denied.value,
    ),
    { ok: false, code: 'FORBIDDEN' },
  );
  const invalid = deps();
  assert.deepEqual(
    await runCloneCatalogAction(
      { sourceVersionId: versionId, operationId, reviewReference: '' },
      invalid.value,
    ),
    { ok: false, code: 'VALIDATION_FAILED' },
  );
  const allowed = deps();
  assert.equal(
    (
      await runEditCatalogAction(
        {
          versionId,
          operationId,
          expectedRevision: 1,
          reviewReference: 'FIN-43',
          patch: { label: '2027 plans' },
        },
        allowed.value,
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await runActivateCatalogAction(
        {
          versionId,
          operationId,
          expectedRevision: 2,
          reviewReference: 'FIN-44',
          effectiveFrom: '2027-01-01T00:00:00.000Z',
        },
        allowed.value,
      )
    ).ok,
    true,
  );
  assert.deepEqual(allowed.calls, [
    'edit:FIN-43:1',
    'revalidate:/admin/plans',
    'activate:FIN-44:2027-01-01T00:00:00.000Z',
    'revalidate:/admin/plans',
  ]);
});

test('active immutable and overlapping-effective errors remain explicit and sanitized', async () => {
  const ctx = deps();
  ctx.value.edit = async () => ({ ok: false, code: 'ACTIVE_IMMUTABLE' });
  ctx.value.activate = async () => ({ ok: false, code: 'EFFECTIVE_OVERLAP' });
  assert.deepEqual(
    await runEditCatalogAction(
      {
        versionId,
        operationId,
        expectedRevision: 1,
        reviewReference: 'FIN-45',
        patch: { label: 'x' },
      },
      ctx.value,
    ),
    { ok: false, code: 'ACTIVE_IMMUTABLE' },
  );
  assert.deepEqual(
    await runActivateCatalogAction(
      {
        versionId,
        operationId,
        expectedRevision: 1,
        reviewReference: 'FIN-46',
        effectiveFrom: '2027-01-01T00:00:00.000Z',
      },
      ctx.value,
    ),
    { ok: false, code: 'EFFECTIVE_OVERLAP' },
  );
  assert.deepEqual(ctx.calls, []);
});
