import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/app/admin/observability/actions.ts'), 'utf8');

test('unlock is atomic, replay-safe at the database boundary and never skips tenantless audit', () => {
  const unlock = source.slice(source.indexOf('export async function unlockAccountAction'));
  assert.match(unlock, /unlock_account_with_platform_audit/u);
  assert.doesNotMatch(unlock, /auth_failed_attempts/u);
  assert.doesNotMatch(unlock, /audit row skipped/u);
});

test('session revocations write mandatory platform audit with opaque targets', () => {
  assert.match(source, /auditPlatformSessionRevoke/u);
  assert.match(source, /append_platform_audit_event/u);
  assert.match(source, /target_opaque_id/u);
  assert.doesNotMatch(source, /details: \{ target_user_id/u);
});
