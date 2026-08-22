import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('generic account action remains limited to non-credential PRO profile fields', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/account/actions.ts'), 'utf8');
  assert.match(source, /RoleProSchema/u);
  assert.match(source, /updateSelfRoleFields/u);
  assert.doesNotMatch(source, /license_no|credentialId|identifierCiphertext|identifier_hash/u);
});

test('credential client uses the secured lifecycle APIs and refreshes masked server state', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/account/ProCredentialForm.tsx'),
    'utf8',
  );
  assert.match(source, /\/api\/v1\/account\/pro\/credentials/u);
  assert.match(source, /expectedVersion/u);
  assert.match(source, /operationId/u);
  assert.match(source, /STALE_CREDENTIAL_VERSION/u);
  assert.match(source, /OPERATION_REUSED/u);
  assert.match(source, /router\.refresh/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./u);
});
