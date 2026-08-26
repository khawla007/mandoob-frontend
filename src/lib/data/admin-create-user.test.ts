import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-create-user.ts'), 'utf8');
const acceptanceRoute = readFileSync(
  join(process.cwd(), 'src/app/api/v1/auth/invite/accept/route.ts'),
  'utf8',
);

test('PRO invitations preserve the Auth/profile lifecycle without generic credential fields', () => {
  assert.match(source, /inviteUserByEmail/u);
  assert.match(source, /persistInvitedProfile/u);
  assert.match(source, /input\.role === 'pro'[\s\S]*from\('pro_profiles'\)\.insert/u);
  assert.match(source, /profile_id: newUserId[\s\S]*designation:[\s\S]*service_areas:[\s\S]*bio:/u);
  assert.doesNotMatch(
    source,
    /license_no|credentials_verified|verified_at|verified_by_profile_id/u,
  );
});

test('invitation acceptance still activates the profile with recorded consent', () => {
  assert.match(acceptanceRoute, /inviteAcceptSchema\.safeParse/u);
  assert.match(acceptanceRoute, /status: 'active'/u);
  assert.match(acceptanceRoute, /consent_accepted_at: new Date\(\)\.toISOString\(\)/u);
  assert.match(acceptanceRoute, /policy_version: policyVersion/u);
  assert.match(acceptanceRoute, /kind: 'invite_accepted'/u);
});
