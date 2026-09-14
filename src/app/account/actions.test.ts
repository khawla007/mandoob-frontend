import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createCredentialPostHandler } from '@/app/api/v1/account/pro/credentials/route-handler';
import { createEvidenceGetHandler } from '@/app/api/v1/account/pro/credentials/evidence/[evidenceId]/route-handler';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = '22222222-2222-4222-8222-222222222222';
const OPERATION = '33333333-3333-4333-8333-333333333333';

function credentialRequest(body: unknown) {
  return new Request('http://localhost/api/v1/account/pro/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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

test('secured self route executes create, blank-preserving save, submit, and replacement commands', async () => {
  const commands: Array<Record<string, unknown>> = [];
  for (const body of [
    { command: 'create', operationId: OPERATION },
    {
      command: 'save',
      credentialId: CREDENTIAL,
      identifier: '',
      issuingAuthority: 'DET',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      expectedVersion: 1,
      operationId: OPERATION,
    },
    { command: 'submit', credentialId: CREDENTIAL, expectedVersion: 1, operationId: OPERATION },
    { command: 'replace', credentialId: CREDENTIAL, expectedVersion: 1, operationId: OPERATION },
  ]) {
    const handler = createCredentialPostHandler({
      guardCsrf: async () => null,
      requirePro: async () => ({
        id: ACTOR,
        role: 'pro',
        tenantId: null,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => ({
        proProfileId: ACTOR,
        credentialIds: body.command === 'create' ? [] : [CREDENTIAL],
      }),
      limit: async () => 'allowed',
      mutate: async (_actor, _target, command) => {
        commands.push(command);
        return { credentialId: CREDENTIAL, version: 2 };
      },
      revalidate: () => undefined,
    });
    assert.equal((await handler(credentialRequest(body))).status, 200);
  }
  assert.deepEqual(
    commands.map((command) => command.command),
    ['create', 'save', 'submit', 'replace'],
  );
  assert.equal(commands[1]?.identifier, '');
});

test('masked evidence open proxies the authorized file without credentials in a URL', async () => {
  const handler = createEvidenceGetHandler({
    requireViewer: async () => ({
      id: ACTOR,
      role: 'pro',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    open: async () => ({
      evidence_id: OPERATION,
      pro_profile_id: ACTOR,
      credential_id: CREDENTIAL,
      storage_path: `pro-credentials/${ACTOR}/${CREDENTIAL}/${OPERATION}`,
      mime_type: 'application/pdf',
      size_bytes: 5,
      original_name_safe: 'licence.pdf',
    }),
    download: async () => new Blob(['%PDF-'], { type: 'application/pdf' }),
  });
  const response = await handler(new Request('http://localhost'), {
    params: Promise.resolve({ evidenceId: OPERATION }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('content-disposition'), 'attachment');
  assert.equal(await response.text(), '%PDF-');
  assert.doesNotMatch(response.url, /token|pro-credentials|licence\.pdf/iu);
});

test('mandatory operator MFA removal delegates to the distributed invariant', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/account/actions.ts'), 'utf8');
  const remove = source.slice(
    source.indexOf('export async function removeMfaFactorAction'),
    source.indexOf('export async function updateRoleFieldsAction'),
  );
  assert.match(remove, /removeMfaFactorWithInvariant/u);
  assert.match(remove, /reserveMfaFactorRemoval/u);
  assert.match(remove, /releaseMfaFactorRemovalReservation/u);
  assert.match(remove, /listVerifiedFactorIds/u);
  assert.match(remove, /unenroll/u);
});
