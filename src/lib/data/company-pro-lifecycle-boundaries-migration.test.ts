import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const path = join(
  process.cwd(),
  'supabase/migrations/20260916031000_0094_company_pro_lifecycle_boundaries.sql',
);
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

test('onboarding reusable read gates fresh tenant/company status without removing setup compatibility', () => {
  assert.match(sql, /company\.status not in \('suspended', 'churned'\)/u);
  assert.match(sql, /tenant\.status in \('pending', 'unassigned', 'active'\)/u);
  assert.match(sql, /ONBOARDING_BOUNDARY_REWRITE_MISSED/u);
  assert.match(sql, /pg_get_functiondef/u);
});

test('onboarding read preserves renewal-due and renewal-overdue noninactive snapshots', () => {
  assert.doesNotMatch(sql, /company\.status in \('onboarding', 'active'\)/u);
  assert.match(sql, /company\.status not in \('suspended', 'churned'\)/u);
});

test('evidence boundary obtains ordered profile locks before the credential mutex and revalidates owner', () => {
  const ownerRead = sql.indexOf('select pro_profile_id into v_owner');
  const profileLock = sql.indexOf('assert_pro_lifecycle_actor(p_actor_id, v_owner');
  const credentialLock = sql.indexOf('for update;', profileLock);
  assert.ok(ownerRead >= 0 && ownerRead < profileLock && profileLock < credentialLock);
  assert.match(sql, /v_locked_owner is distinct from v_owner/u);
  assert.match(sql, /authorize_pro_lifecycle_actor\(p_actor_id, v_owner/u);
  for (const name of [
    'prepare_pro_credential_evidence_upload',
    'prepare_pro_credential_evidence_removal',
    'finalize_pro_credential_evidence_upload',
    'finalize_pro_credential_evidence_removal',
    'claim_pro_credential_evidence_removal_recovery',
    'finalize_pro_credential_evidence_removal_recovery',
  ]) {
    assert.ok(sql.includes(`public.${name}(`), name);
  }
  assert.match(sql, /EVIDENCE_BOUNDARY_REWRITE_MISSED/u);
  assert.match(sql, /revoke all on function private\.lock_pro_evidence_actor_first/u);
});

for (const relative of [
  'company/page.tsx',
  'company/setup/page.tsx',
  'company/setup/[section]/page.tsx',
  'company/setup/actions.ts',
]) {
  test(`${relative} enforces privileged session directly before sensitive reads or mutations`, () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)', relative),
      'utf8',
    );
    const authAt = source.indexOf('await requireProTenantRouteAccess(');
    const mfaAt = source.indexOf('await enforcePrivilegedSession(session)');
    assert.ok(authAt >= 0 && mfaAt > authAt);
    const readAt = relative.endsWith('actions.ts')
      ? source.indexOf('return { actorProfileId: session.id')
      : source.indexOf('await readAssignedCompanyForPro(');
    assert.ok(mfaAt < readAt);
  });
}
