process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

type Module = typeof import('./employee-portal-workspace');
let modulePromise: Promise<Module> | null = null;
const load = () => (modulePromise ??= import('./employee-portal-workspace'));

test('identifier masking occurs at the server display boundary and exposes final four only', async () => {
  const { maskEmployeeIdentifier } = await load();
  assert.equal(maskEmployeeIdentifier('784-1990-1234567-1'), '•••• 5671');
  assert.equal(maskEmployeeIdentifier('AB12'), '•••• AB12');
  assert.equal(maskEmployeeIdentifier('  '), null);
  assert.equal(maskEmployeeIdentifier(null), null);
});

test('Dubai deadline classification preserves missing, overdue, today, soon and future', async () => {
  const { classifyEmployeeDeadline } = await load();
  const today = '2026-09-05';
  assert.deepEqual(classifyEmployeeDeadline(null, 'upcoming', today), {
    kind: 'missing-date',
    daysOut: null,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-09-04', 'upcoming', today), {
    kind: 'overdue',
    daysOut: -1,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-09-05', 'upcoming', today), {
    kind: 'due-today',
    daysOut: 0,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-10-05', 'due_soon', today), {
    kind: 'due-soon',
    daysOut: 30,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-10-06', 'overdue', today), {
    kind: 'status-conflict',
    daysOut: 31,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-11-05', 'upcoming', today), {
    kind: 'future',
    daysOut: 61,
  });
  assert.deepEqual(classifyEmployeeDeadline('2026-08-01', 'completed', today), {
    kind: 'completed',
    daysOut: null,
  });
});

test('Employee links encode tenant slugs and only expose completed routes', async () => {
  const { employeePortalHref } = await load();
  assert.equal(
    employeePortalHref('team / one', 'identity', 'emirates-id'),
    '/t/team%20%2F%20one/employee/identity#emirates-id',
  );
  assert.equal(
    employeePortalHref('team / one', 'renewals'),
    '/t/team%20%2F%20one/employee/renewals',
  );
});

test('Employee authorization fails closed for another profile, tenant or inactive record', async () => {
  const { authorizeEmployeePortalRead } = await load();
  const tenant = { id: 'tenant-1', slug: 'acme', name: 'Acme' } as never;
  const base = {
    requireRouteAccess: async () => ({
      tenant,
      session: { id: 'profile-1', role: 'employee', tenantId: 'tenant-1' } as never,
    }),
    requireActiveTenant: async () => undefined,
    deny: () => {
      throw new Error('DENIED');
    },
  };
  for (const employee of [
    null,
    {
      id: 'employee-1',
      tenantId: 'tenant-2',
      companyId: 'company-1',
      profileId: 'profile-1',
      status: 'active',
    },
    {
      id: 'employee-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      profileId: 'profile-2',
      status: 'active',
    },
    {
      id: 'employee-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      profileId: 'profile-1',
      status: 'inactive',
    },
  ]) {
    await assert.rejects(
      authorizeEmployeePortalRead('acme', undefined, {
        ...base,
        readEmployee: async () => employee as never,
      }),
      /DENIED/u,
    );
  }
});

test('Employee authorization returns a masked allowlisted display contract', async () => {
  const { authorizeEmployeePortalRead } = await load();
  const result = await authorizeEmployeePortalRead('acme', 'profile-1', {
    requireRouteAccess: async () => ({
      tenant: { id: 'tenant-1', slug: 'acme', name: 'Acme' } as never,
      session: { id: 'profile-1', role: 'employee', tenantId: 'tenant-1' } as never,
    }),
    requireActiveTenant: async () => undefined,
    readEmployee: async () => ({
      id: 'employee-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      profileId: 'profile-1',
      status: 'active',
      name: 'Employee One',
      nationality: 'Emirati',
      passportNo: 'P1234567',
      visaNo: 'V7654321',
      visaExpiry: '2026-10-01',
      emiratesId: '784199012345671',
      eidExpiry: null,
      company: { id: 'company-1', tenantId: 'tenant-1', name: 'Acme', status: 'active' },
    }),
  });
  assert.equal(result.employee.passportMasked, '•••• 4567');
  assert.equal(result.employee.visaMasked, '•••• 4321');
  assert.equal(result.employee.emiratesIdMasked, '•••• 5671');
  assert.doesNotMatch(JSON.stringify(result), /P1234567|V7654321|784199012345671/u);
});

test('inactive Company state is explicit and withholds the Company display name', async () => {
  const { authorizeEmployeePortalRead } = await load();
  const result = await authorizeEmployeePortalRead('acme', undefined, {
    requireRouteAccess: async () => ({
      tenant: { id: 'tenant-1', slug: 'acme', name: 'Acme' } as never,
      session: { id: 'profile-1', role: 'employee', tenantId: 'tenant-1' } as never,
    }),
    requireActiveTenant: async () => undefined,
    readEmployee: async () => ({
      id: 'employee-1',
      tenantId: 'tenant-1',
      companyId: 'company-1',
      profileId: 'profile-1',
      status: 'active',
      company: {
        id: 'company-1',
        tenantId: 'tenant-1',
        name: 'Private inactive Company',
        status: 'inactive',
      },
    }),
  });
  assert.deepEqual(result.company, { kind: 'inactive', name: null });
  assert.doesNotMatch(JSON.stringify(result), /Private inactive Company/u);
});

test('overview sources settle independently without converting errors to empty', async () => {
  const { loadEmployeeOverview } = await load();
  const access = {
    tenant: { id: 'tenant-1', slug: 'acme' },
    session: { id: 'profile-1' },
    employee: { id: 'employee-1', companyId: 'company-1' },
  } as never;
  const result = await loadEmployeeOverview(access, {
    loadAssignment: async () => ({ kind: 'missing' }),
    loadDocuments: async () => {
      throw new Error('private database text');
    },
    loadRenewals: async () => ({
      kind: 'empty',
      value: [],
      nearest: null,
      hasMore: false,
      summaries: { overdue: 0, dueSoon: 0, upcoming: 0, completed: 0 },
    }),
    loadPreference: async () => ({ renewalRemindersEnabled: false }),
  });
  assert.deepEqual(result.assignment, { kind: 'missing' });
  assert.deepEqual(result.documents, { kind: 'error' });
  assert.equal(result.renewals.kind, 'empty');
  assert.deepEqual(result.preference, { kind: 'ready', value: { renewalRemindersEnabled: false } });
  assert.doesNotMatch(JSON.stringify(result), /private database text/u);
});

test('Employee document and renewal reads bind tenant, Company and own employee with deterministic bounds', () => {
  const source = readFileSync(new URL('./employee-portal-workspace.ts', import.meta.url), 'utf8');
  for (const table of ['document_requests', 'documents', 'renewals']) {
    const start = source.indexOf(`.from('${table}')`);
    assert.ok(start >= 0, `${table} query exists`);
    const query = source.slice(start, source.indexOf(';', start));
    assert.match(query, /\.eq\('tenant_id'/u);
    assert.match(query, /\.eq\('company_id'/u);
    assert.match(query, /\.eq\('employee_id'/u);
    assert.match(query, /\.order\(/u);
    assert.match(query, /\.limit\(ROW_LIMIT \+ 1\)/u);
  }
  assert.doesNotMatch(source, /uploadDocument\(/u);
  assert.match(source, /upload:\s*'phase-3-unavailable'/u);
  assert.match(source, /requestRows && documentRows/u);
  assert.match(source, /documentRows && !documentHasMore/u);
  assert.match(source, /\.in\('status', \['upcoming', 'due_soon', 'overdue'\]\)/u);
  assert.match(source, /liveRows = rows\.filter\(\(row\) => row\.source === 'renewal'\)/u);
  assert.match(source, /company\?\.kind !== 'active'[\s\S]*?kind: 'unavailable'/u);
});

test('assigned PRO read allows one active scoped assignment and exposes no contact fields', () => {
  const source = readFileSync(new URL('./employee-portal-workspace.ts', import.meta.url), 'utf8');
  const start = source.indexOf(".from('pro_company_assignments')");
  const query = source.slice(start, source.indexOf(';', start));
  assert.match(query, /\.eq\('tenant_id'/u);
  assert.match(query, /\.eq\('company_id'/u);
  assert.match(query, /\.eq\('status', 'active'\)/u);
  assert.match(query, /\.limit\(2\)/u);
  assert.doesNotMatch(source, /phone|email|mailto:|tel:/u);
});
