import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  FIXTURE_PREFIX,
  assertReusableFixture,
  assertReusableFixtureSnapshot,
  buildRoleSeeds,
  assertFixtureCounts,
  readReusableFixtureSecrets,
  reuseExistingFixture,
  runAfterLocalPreflight,
  verifyReusableCredentials,
  writeSecretFile,
  type FixtureCounts,
  type ReusableFixtureSnapshot,
  type RuntimeSecrets,
} from './fixture';

const FIXTURE_IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  pro: '00000000-0000-4000-8000-000000000002',
  customer: '00000000-0000-4000-8000-000000000003',
  employee: '00000000-0000-4000-8000-000000000004',
  tenant: '00000000-0000-4000-8000-000000000005',
  company: '00000000-0000-4000-8000-000000000006',
} as const;

function validSecrets(): RuntimeSecrets {
  return {
    roles: buildRoleSeeds().map((role) => ({ ...role, totpSecret: 'TESTTOTPSECRET' })),
    tenantSlug: 'p2-12-company',
    tenantId: FIXTURE_IDS.tenant,
    companyId: FIXTURE_IDS.company,
    encryptionKey: Buffer.alloc(32, 7).toString('base64'),
    aliases: {
      company: FIXTURE_IDS.company,
      section: 'legal',
      registration: '00000000-0000-4000-8000-000000000012',
      invoice: '00000000-0000-4000-8000-000000000007',
      job: '00000000-0000-4000-8000-000000000008',
      blogCms: '00000000-0000-4000-8000-000000000009',
      pageCms: '00000000-0000-4000-8000-000000000010',
      pro: FIXTURE_IDS.pro,
      user: FIXTURE_IDS.employee,
      erasure: '00000000-0000-4000-8000-000000000013',
      serviceCase: '00000000-0000-4000-8000-000000000011',
    },
  };
}

function exactSnapshot(): ReusableFixtureSnapshot {
  const tenantId = FIXTURE_IDS.tenant;
  const companyId = FIXTURE_IDS.company;
  return {
    users: exactUsers().map((user) => {
      const role = user.email.replace('@p2-12.local', '').replace('admin', 'super_admin');
      return {
        ...user,
        emailConfirmed: true,
        appMetadata: {
          mandoob_role: role,
          mandoob_status: 'active',
          tenant_id: role === 'super_admin' ? null : tenantId,
        },
      };
    }),
    profiles: exactUsers().map((user) => {
      const role = user.email.replace('@p2-12.local', '').replace('admin', 'super_admin');
      return {
        id: user.id,
        role,
        status: 'active',
        tenant_id: role === 'super_admin' ? null : tenantId,
        mfa_enrolled_at: '2026-09-08T00:00:00Z',
      };
    }),
    tenant: { id: tenantId, slug: 'p2-12-company', status: 'active' },
    company: { id: companyId, tenant_id: tenantId, status: 'active' },
    assignment: {
      tenant_id: tenantId,
      company_id: companyId,
      pro_profile_id: FIXTURE_IDS.pro,
      status: 'active',
    },
    customerProfile: {
      profile_id: FIXTURE_IDS.customer,
      linked_company_id: companyId,
    },
    employee: {
      id: '00000000-0000-4000-8000-000000000014',
      profile_id: FIXTURE_IDS.employee,
      tenant_id: tenantId,
      company_id: companyId,
      status: 'active',
    },
    credential: { pro_profile_id: FIXTURE_IDS.pro, state: 'verified' },
    invoice: { id: validSecrets().aliases.invoice, tenant_id: tenantId, company_id: companyId },
    job: {
      id: validSecrets().aliases.job,
      tenant_id: tenantId,
      company_id: companyId,
      kind: 'employees',
      status: 'completed',
    },
    blogCms: { id: validSecrets().aliases.blogCms, slug: 'p2-12-local-draft', status: 'draft' },
    pageCms: { id: validSecrets().aliases.pageCms, slug: 'p2-12-local-page', status: 'draft' },
    serviceCase: {
      id: validSecrets().aliases.serviceCase,
      tenant_id: tenantId,
      company_id: companyId,
      created_by: FIXTURE_IDS.pro,
    },
  };
}

const exactCounts: FixtureCounts = {
  authUsers: 4,
  profiles: 4,
  superAdmins: 1,
  pros: 1,
  customers: 1,
  employees: 1,
  tenants: 1,
  companies: 1,
  activeAssignments: 1,
  verifiedProCredentials: 1,
};

function exactUsers() {
  return [
    { id: FIXTURE_IDS.admin, email: 'admin@p2-12.local' },
    { id: FIXTURE_IDS.pro, email: 'pro@p2-12.local' },
    { id: FIXTURE_IDS.customer, email: 'customer@p2-12.local' },
    { id: FIXTURE_IDS.employee, email: 'employee@p2-12.local' },
  ];
}

describe('P2.12 fixture definition', () => {
  it('creates exactly four synthetic role identities with unique generated passwords', () => {
    const roles = buildRoleSeeds();
    assert.deepEqual(
      roles.map(({ role }) => role),
      ['super_admin', 'pro', 'customer', 'employee'],
    );
    assert.equal(new Set(roles.map(({ email }) => email)).size, 4);
    assert.equal(new Set(roles.map(({ password }) => password)).size, 4);
    for (const role of roles) {
      assert.match(role.email, /@p2-12\.local$/u);
      assert.equal(role.fullName.startsWith(FIXTURE_PREFIX), true);
      assert.equal(role.password.length >= 32, true);
      assert.match(role.password, /[A-Z]/u);
      assert.match(role.password, /[a-z]/u);
      assert.match(role.password, /[0-9]/u);
      assert.match(role.password, /[^A-Za-z0-9]/u);
    }
  });

  it('completes local preflight before any service-role request', async () => {
    const order: string[] = [];
    await runAfterLocalPreflight(
      async () => order.push('preflight'),
      async () => order.push('service-role'),
    );
    assert.deepEqual(order, ['preflight', 'service-role']);
    await assert.rejects(
      () =>
        runAfterLocalPreflight(
          async () => {
            throw new Error('unsafe target');
          },
          async () => order.push('should-not-run'),
        ),
      /unsafe target/u,
    );
    assert.equal(order.includes('should-not-run'), false);
  });

  it('writes credentials to an owner-only file without returning their contents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2-12-fixture-test-'));
    const path = join(dir, 'credentials.json');
    const result = await writeSecretFile(path, buildRoleSeeds());
    assert.equal(result, path);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { roles: unknown[] };
    assert.equal(parsed.roles.length, 4);
  });

  it('requires the one-Company and one-assignment invariant with four identities', () => {
    const passing = exactCounts;
    assert.doesNotThrow(() => assertFixtureCounts(passing));
    for (const key of Object.keys(passing) as Array<keyof FixtureCounts>) {
      assert.throws(
        () => assertFixtureCounts({ ...passing, [key]: passing[key] + 1 }),
        /P2_FIXTURE/u,
      );
    }
  });

  it('reuses an exact fixture on a second setup without invoking creation', async () => {
    let creates = 0;
    const reused = await reuseExistingFixture(true, {
      verify: async () => assertReusableFixture(exactCounts, exactUsers(), validSecrets()),
      create: async () => {
        creates += 1;
      },
    });
    assert.equal(reused, true);
    assert.equal(creates, 0);
  });

  it('binds every identity, scope, assignment, credential, and dynamic alias', () => {
    const secrets = validSecrets();
    assert.doesNotThrow(() => assertReusableFixtureSnapshot(exactSnapshot(), secrets));
    for (const mutate of [
      (snapshot: ReusableFixtureSnapshot) => {
        snapshot.users[1]!.appMetadata.tenant_id = FIXTURE_IDS.company;
      },
      (snapshot: ReusableFixtureSnapshot) => {
        snapshot.profiles[2]!.role = 'employee';
      },
      (snapshot: ReusableFixtureSnapshot) => {
        snapshot.assignment.pro_profile_id = FIXTURE_IDS.customer;
      },
      (snapshot: ReusableFixtureSnapshot) => {
        snapshot.invoice.id = FIXTURE_IDS.customer;
      },
      (snapshot: ReusableFixtureSnapshot) => {
        snapshot.credential.state = 'pending';
      },
    ]) {
      const snapshot = exactSnapshot();
      mutate(snapshot);
      assert.throws(() => assertReusableFixtureSnapshot(snapshot, secrets), /P2_FIXTURE/u);
    }
  });

  it('verifies every stored password, TOTP secret, and verified factor before reuse', async () => {
    const checked: string[] = [];
    await verifyReusableCredentials(validSecrets().roles, async (role) => checked.push(role.role));
    assert.deepEqual(checked, ['super_admin', 'pro', 'customer', 'employee']);
    await assert.rejects(
      () =>
        verifyReusableCredentials(validSecrets().roles, async (role) => {
          if (role.role === 'customer') throw new Error('bad credential');
        }),
      /P2_FIXTURE/u,
    );
  });

  it('fails closed when an existing fixture is incomplete or its manifest mismatches identities', () => {
    assert.throws(
      () => assertReusableFixture({ ...exactCounts, companies: 0 }, exactUsers(), validSecrets()),
      /P2_FIXTURE/u,
    );
    const mismatched = validSecrets();
    mismatched.aliases.pro = FIXTURE_IDS.customer;
    assert.throws(
      () => assertReusableFixture(exactCounts, exactUsers(), mismatched),
      /P2_FIXTURE/u,
    );
  });

  it('rejects a missing or non-owner-only reusable secret manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2-12-fixture-reuse-test-'));
    const path = join(dir, 'credentials.json');
    await assert.rejects(() => readReusableFixtureSecrets(path), /P2_FIXTURE/u);
    await writeSecretFile(path, validSecrets());
    await chmod(path, 0o644);
    await assert.rejects(() => readReusableFixtureSecrets(path), /mode 0600/u);
  });

  it('rejects final-path and parent-directory symlinks when writing secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'p2-12-fixture-symlink-test-'));
    const realParent = join(dir, 'real');
    await mkdir(realParent, { mode: 0o700 });
    const target = join(realParent, 'target.json');
    await writeSecretFile(target, validSecrets());
    const finalLink = join(realParent, 'final-link.json');
    await symlink(target, finalLink);
    await assert.rejects(() => writeSecretFile(finalLink, validSecrets()), /P2_FIXTURE/u);
    await assert.rejects(() => readReusableFixtureSecrets(finalLink), /P2_FIXTURE/u);

    const parentLink = join(dir, 'parent-link');
    await symlink(realParent, parentLink, 'dir');
    await assert.rejects(
      () => writeSecretFile(join(parentLink, 'credentials.json'), validSecrets()),
      /P2_FIXTURE/u,
    );
    await assert.rejects(
      () => readReusableFixtureSecrets(join(parentLink, 'target.json')),
      /P2_FIXTURE/u,
    );
  });
});
