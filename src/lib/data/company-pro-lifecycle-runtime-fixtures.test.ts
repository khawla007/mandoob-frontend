import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const path = join(
  process.cwd(),
  'supabase/tests/company-pro-lifecycle-isolated-status-recovery.sql',
);
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

test('runtime fixtures isolate suspended tenant from noninactive onboarding company', () => {
  assert.match(sql, /'starter', 'suspended'/u);
  assert.match(sql, /'Synthetic status fixture', 'onboarding'/u);
  assert.match(sql, /SUSPENDED_TENANT_ONBOARDING_READ_RETURNED/u);
  assert.match(sql, /ACTIVE_TENANT_SUSPENDED_COMPANY_READ_RETURNED/u);
  assert.match(sql, /ACTIVE_TENANT_CHURNED_COMPANY_READ_RETURNED/u);
});

test('actual public recovery claim/finalize fixtures retain disabled-target compatibility and rollback cleanup', () => {
  assert.match(sql, /update public\.profiles set status = 'disabled'/u);
  assert.match(sql, /public\.claim_pro_credential_evidence_removal_recovery\(/u);
  assert.match(sql, /public\.finalize_pro_credential_evidence_removal_recovery\(/u);
  assert.match(sql, /INACTIVE_TARGET_RECOVERY_FINALIZE_INCOMPLETE/u);
  assert.match(sql, /rollback;\s*$/u);
});
