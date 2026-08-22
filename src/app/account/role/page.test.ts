import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { requireProRolePageAccess } from '@/app/account/role/authorize';

const page = () => readFileSync(join(process.cwd(), 'src/app/account/role/page.tsx'), 'utf8');

test('PRO self-view directly requires a live active PRO and AAL2 before any read', () => {
  const source = page();
  const auth = source.indexOf('requireProRolePageAccess()');
  const profile = source.indexOf('readSelfPro()');
  assert.ok(auth >= 0 && profile > auth);
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

test('actual page authorization permits active PRO at AAL2 and uniformly denies AAL1', async () => {
  const session = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'pro' as const,
    tenantId: null,
    aal: 'aal2' as const,
    mfaEnrolled: true,
    email: null,
  };
  const active = await requireProRolePageAccess({
    liveViewer: {
      requireSession: async () => session,
      lookupProfile: async () => ({ role: 'pro', status: 'active', tenant_id: null }),
    },
  });
  assert.equal(active.role, 'pro');
  assert.equal(active.aal, 'aal2');

  await assert.rejects(
    requireProRolePageAccess({
      liveViewer: {
        requireSession: async () => ({ ...session, aal: 'aal1' }),
        lookupProfile: async () => ({ role: 'pro', status: 'active', tenant_id: null }),
      },
    }),
    /ACCESS_DENIED/u,
  );
});

test('actual page authorization uniformly denies invited, inactive, and wrong-role profiles', async () => {
  const session = {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'pro' as const,
    tenantId: null,
    aal: 'aal2' as const,
    mfaEnrolled: true,
    email: null,
  };
  for (const profile of [
    { role: 'pro', status: 'invited', tenant_id: null },
    { role: 'pro', status: 'inactive', tenant_id: null },
    { role: 'customer', status: 'active', tenant_id: null },
    { role: 'admin', status: 'active', tenant_id: null },
  ]) {
    await assert.rejects(
      requireProRolePageAccess({
        liveViewer: {
          requireSession: async () => session,
          lookupProfile: async () => profile,
        },
      }),
      /ACCESS_DENIED/u,
    );
  }
});
