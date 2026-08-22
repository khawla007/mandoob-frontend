import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const page = () => readFileSync(join(process.cwd(), 'src/app/account/role/page.tsx'), 'utf8');

test('PRO self-view directly requires a live active PRO and AAL2 before any read', () => {
  const source = page();
  const auth = source.indexOf('requireLiveProAccount()');
  const aal = source.indexOf('requireAal2(session)');
  const profile = source.indexOf('readSelfPro()');
  assert.ok(auth >= 0 && aal > auth && profile > aal);
  assert.match(source, /catch[\s\S]*notFound\(\)/u);
  assert.doesNotMatch(source, /session\.role === 'pro'/u);
});

test('profile and credential sources load independently and credential failure remains isolated', () => {
  const source = page();
  assert.match(source, /Promise\.allSettled/u);
  assert.match(source, /readSelfPro\(\)/u);
  assert.match(source, /readSelfProCredentialSnapshot/u);
  assert.match(source, /credentialResult\.status === 'fulfilled'/u);
  assert.match(source, /RoleProForm/u);
  assert.match(source, /ProCredentialPanel/u);
  assert.doesNotMatch(source, /license_no|decrypt|fullIdentifier/u);
});

test('PRO role route does not render assignment controls or a company switcher', () => {
  const source = page();
  assert.doesNotMatch(source, /CompanySwitcher|Assignment|assignPro|tenant selector/iu);
});
