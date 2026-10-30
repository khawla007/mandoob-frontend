import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const erasure = readFileSync(join(process.cwd(), 'src/lib/data/erasure.ts'), 'utf8');
const actions = readFileSync(
  join(process.cwd(), 'src/app/admin/erasure-requests/actions.ts'),
  'utf8',
);
const detailPage = readFileSync(
  join(process.cwd(), 'src/app/admin/erasure-requests/[id]/page.tsx'),
  'utf8',
);

test('request tokens receive an explicit expiry and verification uses one atomic RPC', () => {
  assert.match(erasure, /verification_expires_at:/u);
  assert.match(erasure, /rpc\(\s*'verify_erasure_request'/u);
  const verification = erasure.slice(erasure.indexOf('export async function verifyErasureRequest'));
  assert.doesNotMatch(verification, /\.from\('erasure_requests'\)[\s\S]+?\.update/u);
});

test('admin approval records a dry-run decision and never invokes destructive cleanup', () => {
  assert.match(actions, /approveErasureDecision/u);
  assert.doesNotMatch(actions, /executeErasure/u);
  assert.match(actions, /expectedVersion/u);
  assert.match(actions, /operationId/u);
  assert.match(detailPage, /formData\.set\('expectedVersion', String\(request\.version\)\)/u);
  assert.equal((detailPage.match(/formData\.set\('operationId',/gu) ?? []).length, 2);
  assert.match(detailPage, /approveLabel=\{t\('erasure\.detail\.approveDecision'\)\}/u);
  assert.match(detailPage, /confirmApprove=\{t\('erasure\.detail\.confirmApproveDecision'\)\}/u);
  assert.doesNotMatch(detailPage, /erasure\.detail\.approveExecute/u);
  assert.doesNotMatch(detailPage, /executeErasure/u);
});

test('destructive worker checks the database policy gate before preparing cleanup', () => {
  const execution = erasure.slice(erasure.indexOf('export async function executeErasure'));
  assert.match(execution, /assert_erasure_cleanup_allowed/u);
  assert.ok(
    execution.indexOf('assert_erasure_cleanup_allowed') <
      execution.indexOf('prepare_erasure_cleanup'),
  );
});
