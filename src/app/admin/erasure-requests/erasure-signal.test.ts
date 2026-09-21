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

test('destructive approval and rejection require localized confirmation before submit', () => {
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
  assert.match(detail, /confirmApprove=\{t\('erasure\.detail\.confirmApprove'\)\}/u);
  assert.match(detail, /confirmReject=\{t\('erasure\.detail\.confirmReject'\)\}/u);
  assert.equal(en.admin.erasure.detail.confirmApprove.length > 0, true);
  assert.equal(en.admin.erasure.detail.confirmReject.length > 0, true);
  assert.equal(ar.admin.erasure.detail.confirmApprove.length > 0, true);
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
  assert.match(actions, /await executeErasure\(requestId, session\.id\)/u);
  assert.match(
    actions,
    /await rejectErasureRequest\(\{ requestId, actorId: session\.id, reason \}\)/u,
  );
  assert.match(decisions, /name="requestId" value=\{requestId\}/u);
  assert.match(decisions, /name="rejectionReason"[\s\S]*?maxLength=\{1000\}[\s\S]*?required/u);
});
