import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const list = source('src/app/admin/erasure-requests/page.tsx');
const detail = source('src/app/admin/erasure-requests/[id]/page.tsx');
const decisions = source('src/components/admin/ErasureDecisionForms.tsx');
const actions = source('src/app/admin/erasure-requests/actions.ts');
const css = source('src/app/globals.css');
const en = JSON.parse(source('src/messages/en.json'));
const ar = JSON.parse(source('src/messages/ar.json'));

test('both Erasure Requests routes opt into the inspected operational workspace', () => {
  for (const page of [list, detail]) {
    assert.match(
      page,
      /admin-management-signal admin-operational-workspace erasure-management-workspace/u,
    );
    assert.match(page, /admin-operational-heading/u);
  }
  assert.match(list, /<Table scrollAreaLabel=\{t\('erasure\.list\.title'\)\}>/u);
  assert.doesNotMatch(list, /text-right/u);
  assert.equal((list.match(/text-end/gu) ?? []).length, 2);
});

test('dry-run approval and rejection require truthful localized confirmation before submit', () => {
  assert.match(detail, /<ErasureDecisionForms/u);
  assert.match(
    detail,
    /approveAction=\{async \(formData\) => \{[\s\S]*?await approveErasureAction\(formData\)/u,
  );
  assert.match(
    detail,
    /rejectAction=\{async \(formData\) => \{[\s\S]*?await rejectErasureAction\(formData\)/u,
  );
  assert.match(decisions, /if \(!confirm\(confirmApprove\)\) event\.preventDefault\(\)/u);
  assert.match(decisions, /if \(!confirm\(confirmReject\)\) event\.preventDefault\(\)/u);
  assert.match(detail, /approveLabel=\{t\('erasure\.detail\.approveDecision'\)\}/u);
  assert.match(detail, /confirmApprove=\{t\('erasure\.detail\.confirmApproveDecision'\)\}/u);
  assert.match(detail, /confirmReject=\{t\('erasure\.detail\.confirmReject'\)\}/u);
  assert.match(en.admin.erasure.detail.confirmApproveDecision, /dry-run/u);
  assert.match(en.admin.erasure.detail.confirmApproveDecision, /No personal data will be erased/u);
  assert.equal(en.admin.erasure.detail.confirmReject.length > 0, true);
  assert.equal(ar.admin.erasure.detail.confirmApproveDecision.length > 0, true);
  assert.equal(ar.admin.erasure.detail.confirmReject.length > 0, true);
  assert.match(decisions, /variant="destructive"/u);
  assert.match(css, /\.dark \.erasure-management-workspace button\[data-variant='destructive'\]/u);
});

test('Erasure authorization, loaders, action security and payload contracts remain direct', () => {
  assert.match(list, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(detail, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(list, /await listAdminErasureRequests\(\)/u);
  assert.match(detail, /await getErasureRequestDetail\(id\)/u);
  assert.match(
    actions,
    /const session = await requireRole\('super_admin', 'admin'\);\s*await requireAal2\(session\);/u,
  );
  assert.match(
    actions,
    /await approveErasureDecision\(\{[\s\S]*?requestId,[\s\S]*?actorId: session\.id,[\s\S]*?expectedVersion,[\s\S]*?operationId,/u,
  );
  assert.doesNotMatch(actions, /executeErasure/u);
  assert.match(
    actions,
    /await rejectErasureRequest\(\{[\s\S]*?requestId,[\s\S]*?actorId: session\.id,[\s\S]*?reason,[\s\S]*?expectedVersion,[\s\S]*?operationId,/u,
  );
  assert.match(detail, /formData\.set\('expectedVersion', String\(request\.version\)\)/u);
  assert.equal((detail.match(/formData\.set\('operationId',/gu) ?? []).length, 2);
  assert.match(decisions, /name="requestId" value=\{requestId\}/u);
  assert.match(decisions, /name="rejectionReason"[\s\S]*?maxLength=\{1000\}[\s\S]*?required/u);
});
