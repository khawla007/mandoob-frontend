import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminLayout = readFileSync(new URL('../../app/admin/layout.tsx', import.meta.url), 'utf8');
const proLayout = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(pro)/layout.tsx', import.meta.url),
  'utf8',
);

test('Admin shell propagates AAL enforcement failures before rendering protected children', () => {
  assert.match(adminLayout, /requireMfaEnrolled/u);
  assert.match(adminLayout, /await requireMfaEnrolled\(session\);/u);
  assert.match(adminLayout, /await requireAal2\(session\);/u);
  assert.doesNotMatch(adminLayout, /requireAal2\(session\)\.catch/u);
  assert.ok(
    adminLayout.indexOf('await requireAal2(session);') < adminLayout.indexOf('return ('),
    'AAL enforcement must complete before protected shell rendering',
  );
  assert.ok(
    adminLayout.indexOf('await requireMfaEnrolled(session);') <
      adminLayout.indexOf('await requireAal2(session);'),
    'MFA enrollment must be enforced before an AAL2 challenge is required',
  );
});

test('PRO shell propagates MFA enrollment failures before rendering protected children', () => {
  assert.match(proLayout, /await requireMfaEnrolled\(session\);/u);
  assert.doesNotMatch(proLayout, /requireMfaEnrolled\(session\)\.catch/u);
  assert.ok(
    proLayout.indexOf('await requireMfaEnrolled(session);') < proLayout.indexOf('return ('),
    'MFA enrollment enforcement must complete before protected shell rendering',
  );
});
