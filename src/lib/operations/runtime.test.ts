import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  loadOperationalWorkspace,
  OPERATIONAL_PAGE_SIZE,
  setOperationalNotificationReadState,
} from './runtime';

const runtimePath = new URL('./runtime.ts', import.meta.url);
const workspacePath = new URL(
  '../../components/operations/OperationalWorkspace.tsx',
  import.meta.url,
);
const readFormPath = new URL(
  '../../components/operations/OperationalNotificationReadForm.tsx',
  import.meta.url,
);
const runtime = existsSync(runtimePath) ? readFileSync(runtimePath, 'utf8') : '';
const workspace = existsSync(workspacePath) ? readFileSync(workspacePath, 'utf8') : '';
const readForm = existsSync(readFormPath) ? readFileSync(readFormPath, 'utf8') : '';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const TENANT_ID = '00000000-0000-4000-8000-000000000002';
const COMPANY_ID = '00000000-0000-4000-8000-000000000003';

function rowId(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}

function proSession() {
  return {
    id: ACTOR_ID,
    email: 'pro@example.test',
    role: 'pro' as const,
    tenantId: TENANT_ID,
    aal: 'aal2' as const,
    mfaEnrolled: true,
  };
}

const operationalRoutes = [
  'src/app/admin/tasks/page.tsx',
  'src/app/admin/communications/page.tsx',
  'src/app/admin/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(pro)/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(customer)/portal/activity/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/tasks/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/communications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/notifications/page.tsx',
  'src/app/(tenant)/t/[tenant]/(employee)/employee/activity/page.tsx',
] as const;

test('runtime resolves each role through its direct authoritative access boundary', () => {
  assert.match(runtime, /requirePlatformOperator/u);
  assert.match(runtime, /requireProTenantRouteAccess/u);
  assert.match(runtime, /readAssignedCompanyForPro/u);
  assert.match(runtime, /requireAuthorizedCustomerLinkedCompanyRead/u);
  assert.match(runtime, /authorizeEmployeePortalRead/u);
  assert.match(runtime, /company\.tenantId !== tenant\.id|company\.tenantId === tenant\.id/u);
});

test('runtime reads only through stable company-scoped P3.10 cursor RPCs', () => {
  for (const rpc of [
    'list_operational_notifications',
    'list_operational_tasks',
    'list_operational_activity',
  ]) {
    assert.match(runtime, new RegExp(rpc, 'u'));
  }
  assert.match(runtime, /p_company_id/u);
  assert.match(runtime, /p_before_created_at/u);
  assert.match(runtime, /p_before_id/u);
  assert.match(runtime, /createdAt[\s\S]*id/u);
  assert.doesNotMatch(runtime, /service-role|createSupabaseServiceRoleClient/u);
});

test('notification mutation reauthorizes and uses the recipient-safe replay RPC', () => {
  assert.match(runtime, /set_operational_notification_read_state/u);
  assert.match(runtime, /p_notification_id/u);
  assert.match(runtime, /p_read/u);
  assert.match(runtime, /p_operation_id/u);
  assert.match(runtime, /randomUUID/u);
  assert.match(workspace, /revalidatePath/u);
});

test('notification read-state control reports pending and sanitized outcomes accessibly', () => {
  assert.match(readForm, /useActionState/u);
  assert.match(readForm, /name="operationId"/u);
  assert.match(readForm, /disabled=\{pending\}/u);
  assert.match(readForm, /aria-live="polite"/u);
  assert.doesNotMatch(readForm, /error\.message|error\.details|error\.hint/u);
});

test('communications preserves unavailable-channel truth without provider claims', () => {
  assert.match(runtime, /module === 'communications'/u);
  assert.match(runtime, /channelState: 'disabled'/u);
  assert.doesNotMatch(workspace, /delivery success|provider available|unread count/iu);
  assert.doesNotMatch(runtime, /twilio|unifonic|resend|whatsapp/u);
});

test('workspace localizes operational codes instead of exposing raw identifiers', () => {
  assert.match(workspace, /runtime\.codes/u);
  assert.doesNotMatch(workspace, /<CardTitle[^>]*>\{item\.code\}/u);
});

test('runtime converts backend failures to a finite sanitized result', () => {
  assert.match(runtime, /sanitizeOperationalError/u);
  assert.match(runtime, /code: 'unavailable'/u);
  assert.doesNotMatch(workspace, /error\.message|error\.details|error\.hint/u);
});

test('operational pages replace the unavailable route while retaining direct authorization', () => {
  for (const route of operationalRoutes) {
    const source = readFileSync(route, 'utf8');
    assert.match(source, /OperationalWorkspace/u, route);
    assert.doesNotMatch(source, /OperationalUnavailableRoute/u, route);
    if (route.includes('/admin/')) assert.match(source, /requirePlatformOperator/u, route);
    if (route.includes('/\(pro\)/')) assert.match(source, /requireProTenantRouteAccess/u, route);
    if (route.includes('/\(customer\)/'))
      assert.match(source, /authorizeCustomerLinkedCompanyRead/u, route);
    if (route.includes('/\(employee\)/'))
      assert.match(source, /authorizeEmployeePortalRead/u, route);
  }
});

test('English and Arabic operational runtime messages have exact parity', () => {
  const en = JSON.parse(readFileSync('src/messages/en.json', 'utf8')) as {
    operations: { runtime?: unknown };
  };
  const ar = JSON.parse(readFileSync('src/messages/ar.json', 'utf8')) as {
    operations: { runtime?: unknown };
  };
  assert.ok(en.operations.runtime);
  assert.deepEqual(messageShape(en.operations.runtime), messageShape(ar.operations.runtime));
});

test('PRO loader authorizes authoritative Company scope and forwards a complete stable cursor', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const data = Array.from({ length: OPERATIONAL_PAGE_SIZE + 1 }, (_, index) => ({
    id: rowId(index + 10),
    assigned_profile_id: ACTOR_ID,
    task_code: `TASK_${index}`,
    state: 'open',
    priority: 'normal',
    due_at: null,
    safe_metadata: {},
    created_at: `2026-10-${String(28 - index).padStart(2, '0')}T08:00:00.000Z`,
  }));
  const model = await loadOperationalWorkspace(
    {
      role: 'pro',
      module: 'tasks',
      tenantSlug: 'firm-one',
      baseHref: '/t/firm-one/tasks',
      search: {
        companyId: 'untrusted-route-scope',
        before: '2026-10-28T09:00:00.000Z',
        beforeId: rowId(9),
      },
    },
    {
      authorizePro: async () => ({ tenant: { id: TENANT_ID }, session: proSession() }),
      readProCompany: async () => ({ id: COMPANY_ID, tenantId: TENANT_ID }),
      client: {
        async rpc(name, args) {
          calls.push({ name, args });
          return { data, error: null };
        },
      },
    },
  );

  assert.equal(model.state, 'data');
  if (model.state !== 'data') return;
  assert.equal(model.items.length, OPERATIONAL_PAGE_SIZE);
  assert.equal(
    model.nextHref,
    `/t/firm-one/tasks?before=${encodeURIComponent(data[24].created_at)}&beforeId=${data[24].id}`,
  );
  assert.deepEqual(calls, [
    {
      name: 'list_operational_tasks',
      args: {
        p_company_id: COMPANY_ID,
        p_before_created_at: '2026-10-28T09:00:00.000Z',
        p_before_id: rowId(9),
        p_limit: OPERATIONAL_PAGE_SIZE + 1,
      },
    },
  ]);
});

test('loader fails closed before the RPC when the resolved Company is outside the tenant', async () => {
  let rpcCalled = false;
  const model = await loadOperationalWorkspace(
    {
      role: 'pro',
      module: 'notifications',
      tenantSlug: 'firm-one',
      baseHref: '/t/firm-one/notifications',
    },
    {
      authorizePro: async () => ({ tenant: { id: TENANT_ID }, session: proSession() }),
      readProCompany: async () => ({ id: COMPANY_ID, tenantId: rowId(999) }),
      client: {
        async rpc() {
          rpcCalled = true;
          return { data: [], error: null };
        },
      },
    },
  );

  assert.deepEqual(model, {
    state: 'error',
    code: 'unavailable',
    channelState: 'disabled',
    items: [],
  });
  assert.equal(rpcCalled, false);
});

test('admin reads require an explicit valid Company scope and never imply a platform count', async () => {
  let rpcCalled = false;
  const model = await loadOperationalWorkspace(
    { role: 'admin', module: 'tasks', baseHref: '/admin/tasks' },
    {
      authorizeAdmin: async () => ({ ...proSession(), role: 'admin', tenantId: null }),
      client: {
        async rpc() {
          rpcCalled = true;
          return { data: [], error: null };
        },
      },
    },
  );

  assert.deepEqual(model, { state: 'scope-required', channelState: 'disabled', items: [] });
  assert.equal(rpcCalled, false);
});

test('communications authorizes its role but does not call a provider or records RPC', async () => {
  let authorized = false;
  let rpcCalled = false;
  const model = await loadOperationalWorkspace(
    {
      role: 'pro',
      module: 'communications',
      tenantSlug: 'firm-one',
      baseHref: '/t/firm-one/communications',
    },
    {
      authorizePro: async () => {
        authorized = true;
        return { tenant: { id: TENANT_ID }, session: proSession() };
      },
      readProCompany: async () => ({ id: COMPANY_ID, tenantId: TENANT_ID }),
      client: {
        async rpc() {
          rpcCalled = true;
          return { data: [], error: null };
        },
      },
    },
  );

  assert.equal(authorized, true);
  assert.equal(rpcCalled, false);
  assert.deepEqual(model, { state: 'unavailable', channelState: 'disabled', items: [] });
});

test('read-state mutation reauthorizes and sends only recipient-safe RPC inputs', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const operationId = rowId(43);
  const result = await setOperationalNotificationReadState(
    {
      role: 'pro',
      tenantSlug: 'firm-one',
      notificationId: rowId(42),
      read: true,
      operationId,
    },
    {
      authorizePro: async () => ({ tenant: { id: TENANT_ID }, session: proSession() }),
      readProCompany: async () => ({ id: COMPANY_ID, tenantId: TENANT_ID }),
      client: {
        async rpc(name, args) {
          calls.push({ name, args });
          return { data: { state: 'read' }, error: null };
        },
      },
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'set_operational_notification_read_state');
  assert.equal(calls[0].args.p_notification_id, rowId(42));
  assert.equal(calls[0].args.p_read, true);
  assert.equal(calls[0].args.p_operation_id, operationId);
});

test('RPC failures and invalid response rows expose only the finite sanitized error', async () => {
  for (const response of [
    { data: null, error: { message: 'private database detail' } },
    { data: [{ password: 'secret' }], error: null },
  ]) {
    const model = await loadOperationalWorkspace(
      {
        role: 'pro',
        module: 'activity',
        tenantSlug: 'firm-one',
        baseHref: '/t/firm-one/activity',
      },
      {
        authorizePro: async () => ({ tenant: { id: TENANT_ID }, session: proSession() }),
        readProCompany: async () => ({ id: COMPANY_ID, tenantId: TENANT_ID }),
        client: { rpc: async () => response },
      },
    );
    assert.deepEqual(model, {
      state: 'error',
      code: 'unavailable',
      channelState: 'disabled',
      items: [],
    });
    assert.equal(JSON.stringify(model).includes('private database detail'), false);
    assert.equal(JSON.stringify(model).includes('secret'), false);
  }
});

function messageShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(messageShape);
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, messageShape(item)]),
  );
}
