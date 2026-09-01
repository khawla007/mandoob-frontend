import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionProfile } from './require-user';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'acme',
  name: 'Acme',
  plan: 'starter',
  status: 'active',
};

function session(role: SessionProfile['role']): SessionProfile {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'actor@example.com',
    role,
    tenantId: role === 'pro' || role === 'customer' || role === 'employee' ? tenant.id : null,
    aal: 'aal1',
    mfaEnrolled: false,
  };
}

test('route boundary resolves slug before authoritative access and privileged work', async () => {
  const { requireTenantRouteAccess } = await import('./require-tenant-route-access');
  const calls: string[] = [];
  const result = await requireTenantRouteAccess('acme', ['pro'], {
    resolveTenant: async (slug) => {
      calls.push(`resolve:${slug}`);
      return tenant;
    },
    requireAccess: async (tenantId) => {
      calls.push(`access:${tenantId}`);
      return session('pro');
    },
    deny: () => {
      throw new Error('DENIED');
    },
  });
  calls.push(`read:${result.tenant.id}`);
  assert.deepEqual(calls, [`resolve:acme`, `access:${tenant.id}`, `read:${tenant.id}`]);
});

test('denied authoritative access performs no privileged work', async () => {
  const { requireTenantRouteAccess } = await import('./require-tenant-route-access');
  const calls: string[] = [];
  await assert.rejects(
    requireTenantRouteAccess('acme', ['pro'], {
      resolveTenant: async () => tenant,
      requireAccess: async () => {
        calls.push('access');
        throw new Error('DENIED');
      },
      deny: () => {
        throw new Error('DENIED');
      },
    }),
    /DENIED/,
  );
  assert.deepEqual(calls, ['access']);
});

test('admin and super_admin have identical operator access', async () => {
  const { requireTenantRouteAccess } = await import('./require-tenant-route-access');
  for (const role of ['admin', 'super_admin'] as const) {
    const result = await requireTenantRouteAccess('acme', ['super_admin'], {
      resolveTenant: async () => tenant,
      requireAccess: async () => session(role),
      deny: () => {
        throw new Error('DENIED');
      },
    });
    assert.equal(result.session.role, role);
  }
});

test('wrong authoritative role is denied', async () => {
  const { requireTenantRouteAccess } = await import('./require-tenant-route-access');
  await assert.rejects(
    requireTenantRouteAccess('acme', ['customer'], {
      resolveTenant: async () => tenant,
      requireAccess: async () => session('pro'),
      deny: () => {
        throw new Error('DENIED');
      },
    }),
    /DENIED/,
  );
});

test('PRO mutation boundary denies both platform operator roles equally', async () => {
  const { requireProTenantRouteAccess } = await import('./require-tenant-route-access');
  for (const role of ['admin', 'super_admin'] as const) {
    await assert.rejects(
      requireProTenantRouteAccess('acme', {
        resolveTenant: async () => tenant,
        requireAccess: async () => session(role),
        deny: () => {
          throw new Error('DENIED');
        },
      }),
      /DENIED/,
    );
  }
});

test('PRO boundary returns the authoritative PRO for controls and mutations', async () => {
  const { requireProTenantRouteAccess } = await import('./require-tenant-route-access');
  const result = await requireProTenantRouteAccess('acme', {
    resolveTenant: async () => tenant,
    requireAccess: async () => session('pro'),
    deny: () => {
      throw new Error('DENIED');
    },
  });
  assert.equal(result.session.role, 'pro');
  assert.equal(result.session.tenantId, tenant.id);
});

test('Customer shell denies a customer whose authoritative tenant does not match the route', async () => {
  const { requireCustomerTenantRouteAccess } = await import('./require-tenant-route-access');
  await assert.rejects(
    requireCustomerTenantRouteAccess('acme', {
      resolveTenant: async () => tenant,
      requireAccess: async () => ({
        ...session('customer'),
        tenantId: '33333333-3333-4333-8333-333333333333',
      }),
      deny: () => {
        throw new Error('DENIED');
      },
    }),
    /DENIED/u,
  );
});

test('Customer shell accepts the matching customer and existing platform operator access', async () => {
  const { requireCustomerTenantRouteAccess } = await import('./require-tenant-route-access');
  for (const role of ['customer', 'super_admin'] as const) {
    const result = await requireCustomerTenantRouteAccess('acme', {
      resolveTenant: async () => tenant,
      requireAccess: async () => session(role),
      deny: () => {
        throw new Error('DENIED');
      },
    });
    assert.equal(result.session.role, role);
  }
});
