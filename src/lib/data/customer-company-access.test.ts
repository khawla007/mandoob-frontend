import assert from 'node:assert/strict';
import test from 'node:test';

import type { SessionProfile } from '@/lib/auth/require-user';
import {
  authorizeCustomerLinkedCompanyRead,
  requireAuthorizedCustomerLinkedCompanyRead,
} from './customer-company-access';

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  name: 'Acme',
  plan: 'starter',
  status: 'active',
};
const actorId = '22222222-2222-4222-8222-222222222222';
const companyId = '33333333-3333-4333-8333-333333333333';

function customerSession(overrides: Partial<SessionProfile> = {}): SessionProfile {
  return {
    id: actorId,
    email: 'owner@example.test',
    role: 'customer',
    tenantId: tenant.id,
    aal: 'aal1',
    mfaEnrolled: false,
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      requireRouteAccess: async () => {
        calls.push('route');
        return { tenant, session: customerSession() };
      },
      requireActiveTenant: async (tenantId: string) => calls.push(`active:${tenantId}`),
      readCustomerLink: async (profileId: string) => {
        calls.push(`customer:${profileId}`);
        return { profileId: actorId, linkedCompanyId: companyId };
      },
      readCompany: async (tenantId: string, requestedCompanyId: string) => {
        calls.push(`company:${tenantId}:${requestedCompanyId}`);
        return {
          id: companyId,
          tenantId: tenant.id,
          companyName: 'Acme LLC',
          status: 'active',
          onboardingStatus: 'in_progress',
        };
      },
      deny: () => {
        throw new Error('DENIED');
      },
      ...overrides,
    },
  };
}

test('authorizes the exact Customer actor and linked Company before downstream reads', async () => {
  const { calls, deps } = dependencies();
  const result = await authorizeCustomerLinkedCompanyRead('acme', actorId, deps);
  calls.push('service-read');
  assert.equal(result.kind, 'authorized');
  assert.equal(result.kind === 'authorized' ? result.company.id : null, companyId);
  assert.deepEqual(calls, [
    'route',
    `active:${tenant.id}`,
    `customer:${actorId}`,
    `company:${tenant.id}:${companyId}`,
    'service-read',
  ]);
});

for (const [name, requireRouteAccess] of [
  [
    'unauthenticated',
    async () => {
      throw new Error('UNAUTHENTICATED');
    },
  ],
  [
    'wrong role',
    async () => {
      throw new Error('DENIED_ROLE');
    },
  ],
  [
    'wrong tenant',
    async () => {
      throw new Error('DENIED_TENANT');
    },
  ],
] as const) {
  test(`denies ${name} access before active/link/Company reads`, async () => {
    const { calls, deps } = dependencies({
      requireRouteAccess: async () => {
        calls.push('route');
        return requireRouteAccess() as never;
      },
    });
    await assert.rejects(authorizeCustomerLinkedCompanyRead('acme', actorId, deps));
    assert.deepEqual(calls, ['route']);
  });
}

test('denies an inactive tenant before link and Company reads', async () => {
  const { calls, deps } = dependencies({
    requireActiveTenant: async () => {
      calls.push('active');
      throw new Error('INACTIVE');
    },
  });
  await assert.rejects(authorizeCustomerLinkedCompanyRead('acme', actorId, deps), /INACTIVE/u);
  assert.deepEqual(calls, ['route', 'active']);
});

test('denies an actor mismatch before authoritative profile and Company reads', async () => {
  const { calls, deps } = dependencies();
  await assert.rejects(
    authorizeCustomerLinkedCompanyRead('acme', '44444444-4444-4444-8444-444444444444', deps),
    /DENIED/u,
  );
  assert.deepEqual(calls, ['route', `active:${tenant.id}`]);
});

test('returns an unlinked state without a Company read', async () => {
  const { calls, deps } = dependencies({
    readCustomerLink: async () => {
      calls.push('customer');
      return { profileId: actorId, linkedCompanyId: null };
    },
  });
  const result = await authorizeCustomerLinkedCompanyRead('acme', actorId, deps);
  assert.equal(result.kind, 'unlinked');
  assert.deepEqual(calls, ['route', `active:${tenant.id}`, 'customer']);
});

test('denies an authoritative customer-profile actor mismatch', async () => {
  const { calls, deps } = dependencies({
    readCustomerLink: async () => {
      calls.push('customer');
      return {
        profileId: '44444444-4444-4444-8444-444444444444',
        linkedCompanyId: companyId,
      };
    },
  });
  await assert.rejects(authorizeCustomerLinkedCompanyRead('acme', actorId, deps), /DENIED/u);
  assert.deepEqual(calls, ['route', `active:${tenant.id}`, 'customer']);
});

test('denies a cross-Company or unknown link through tenant plus id ownership', async () => {
  const { calls, deps } = dependencies({
    readCompany: async (tenantId: string, requestedCompanyId: string) => {
      calls.push(`company:${tenantId}:${requestedCompanyId}`);
      return null;
    },
  });
  await assert.rejects(authorizeCustomerLinkedCompanyRead('acme', actorId, deps), /DENIED/u);
  assert.deepEqual(calls, [
    'route',
    `active:${tenant.id}`,
    `customer:${actorId}`,
    `company:${tenant.id}:${companyId}`,
  ]);
});

test('keeps platform operator preview but never widens it into Customer Company reads', async () => {
  for (const role of ['admin', 'super_admin'] as const) {
    const { calls, deps } = dependencies({
      requireRouteAccess: async () => {
        calls.push('route');
        return { tenant, session: customerSession({ role, tenantId: null }) };
      },
    });
    const result = await authorizeCustomerLinkedCompanyRead('acme', actorId, deps);
    assert.equal(result.kind, 'operator-preview');
    assert.deepEqual(calls, ['route', `active:${tenant.id}`]);
  }
});

test('required Customer Company access rejects unlinked and operator-preview states', async () => {
  for (const access of [
    { kind: 'unlinked' as const, tenant, session: customerSession() },
    {
      kind: 'operator-preview' as const,
      tenant,
      session: customerSession({ role: 'admin', tenantId: null }),
    },
  ]) {
    await assert.rejects(
      requireAuthorizedCustomerLinkedCompanyRead('acme', undefined, {
        authorize: async () => access as never,
        deny: () => {
          throw new Error('DENIED');
        },
      }),
      /DENIED/u,
    );
  }
});
