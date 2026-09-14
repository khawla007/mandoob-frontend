import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('CLI verifies status and container identity before constructing privileged adapters', () => {
  let source = '';
  try {
    source = readFileSync('scripts/p1-12-acceptance/cli.ts', 'utf8');
  } catch {}
  const status = source.search(/\[\s*'status',\s*'-o',\s*'json'/u);
  const inspect = source.indexOf("['inspect', ...containerIds]");
  const guard = source.indexOf('const targetSecrets = assertP112Target');
  const client = source.indexOf('createClient(P112_TARGET.apiOrigin');
  assert.ok(status >= 0);
  assert.ok(inspect > status);
  assert.ok(guard > inspect);
  assert.ok(client > guard);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*(serviceRole|status|credentials)/iu);
});

test('CLI exposes only prepare, setup, verify, teardown, and guarded cleanup', () => {
  let source = '';
  try {
    source = readFileSync('scripts/p1-12-acceptance/cli.ts', 'utf8');
  } catch {}
  for (const action of ['prepare', 'setup', 'verify', 'teardown', 'cleanup-project']) {
    assert.match(source, new RegExp(`'${action}'`, 'u'));
  }
  assert.match(source, /P112_ACCEPTANCE_LOCAL_ONLY !== '1'/u);
  assert.match(source, /containerIdsForProject\(true\)/u);
  assert.match(source, /refusing cleanup while project containers exist/u);
  const prepareBranch = source.indexOf("action === 'prepare'");
  const zeroContainerCheck = source.indexOf('containerIdsForProject(true)', prepareBranch);
  const prepareWrite = source.indexOf('prepareRuntimeProject', prepareBranch);
  assert.ok(zeroContainerCheck > prepareBranch);
  assert.ok(prepareWrite > zeroContainerCheck);
  assert.match(source, /refusing prepare while project containers exist/u);
});
