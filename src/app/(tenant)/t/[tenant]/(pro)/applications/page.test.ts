import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { authorizeApplicationsRead } from './page-authorization';
import { applicationPageHref, parseApplicationFilters, parseApplicationPage } from './page-logic';

const pagePath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx');
const tablePath = join(process.cwd(), 'src/components/pro/applications/ApplicationsTable.tsx');
const createFormPath = join(
  process.cwd(),
  'src/components/pro/applications/ApplicationCreateForm.tsx',
);
const statusActionsPath = join(
  process.cwd(),
  'src/components/pro/applications/ApplicationStatusActions.tsx',
);
const logicPath = join(
  process.cwd(),
  'src/app/(tenant)/t/[tenant]/(pro)/applications/page-logic.ts',
);
const englishMessagesPath = join(process.cwd(), 'src/messages/en.json');
const arabicMessagesPath = join(process.cwd(), 'src/messages/ar.json');

test('applications page awaits route inputs, validates stable filters, and uses one workspace read', () => {
  const source = readFileSync(pagePath, 'utf8');
  const logic = readFileSync(logicPath, 'utf8');
  assert.match(source, /params:\s*Promise<\{ tenant: string \}>/);
  assert.match(source, /searchParams:\s*Promise</);
  assert.match(source, /await params/);
  assert.match(source, /await searchParams/);
  assert.match(logic, /serviceCaseFilterSchema\.safeParse/);
  assert.match(logic, /status[^\n]+split\(','\)/);
  assert.match(logic, /assigned_to:\s*first\(search\.owner\)/);
  assert.match(source, /listServiceCaseWorkspace\(/);
  assert.doesNotMatch(source, /listServiceCaseClients\(/);
  assert.doesNotMatch(source, /listServiceCaseOwners\(/);
});

test('applications read authorization runs before any service-role data read', async () => {
  const calls: string[] = [];
  const result = await authorizeApplicationsRead('acme', {
    requirePro: async () => {
      calls.push('auth');
      return { tenantId: 'tenant-1' };
    },
    resolveTenant: async () => {
      calls.push('tenant');
      return { id: 'tenant-1', name: 'Acme' };
    },
    requireActive: async () => {
      calls.push('active');
    },
  });
  calls.push('read');
  assert.ok(result);
  assert.equal(result.id, 'tenant-1');
  assert.deepEqual(calls, ['auth', 'tenant', 'active', 'read']);
});

test('applications read authorization rejects exact tenant mismatch before active/read', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () =>
      authorizeApplicationsRead('acme', {
        requirePro: async () => {
          calls.push('auth');
          return { tenantId: 'tenant-2' };
        },
        resolveTenant: async () => {
          calls.push('tenant');
          return { id: 'tenant-1', name: 'Acme' };
        },
        requireActive: async () => {
          calls.push('active');
        },
      }),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );
  assert.deepEqual(calls, ['auth', 'tenant']);
});

test('applications page invokes fresh authorization before service-role reads', () => {
  const source = readFileSync(pagePath, 'utf8');
  const authorization = source.indexOf('requireProTenantRouteAccess(');
  assert.notEqual(authorization, -1);
  const read = 'listServiceCaseWorkspace(';
  assert.ok(authorization < source.indexOf(read), `${read} must follow authorization`);
});

test('repeated status, owner, and service params choose the first value without throwing', () => {
  const parsed = parseApplicationFilters({
    status: ['documents_pending,submitted', 'cancelled'],
    owner: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    serviceType: ['Golden visa', 'License'],
  });
  assert.deepEqual(parsed, {
    status: ['documents_pending', 'submitted'],
    assigned_to: '11111111-1111-4111-8111-111111111111',
    service_type: 'Golden visa',
  });
  assert.deepEqual(parseApplicationFilters({ status: ['bad', 'submitted'], owner: [] }), {});
});

test('dashboard application filters expand open status and preserve Dubai deadline period', () => {
  assert.deepEqual(
    parseApplicationFilters({
      view: 'open',
      owner: '11111111-1111-4111-8111-111111111111',
      serviceType: 'Golden visa',
    }),
    {
      status: [
        'documents_pending',
        'draft',
        'ready_to_submit',
        'submitted',
        'authority_review',
        'approved',
      ],
      assigned_to: '11111111-1111-4111-8111-111111111111',
      service_type: 'Golden visa',
    },
  );
  assert.deepEqual(
    parseApplicationFilters({ date: '2026-08-12', period: 'morning', eventTypes: 'case' }),
    {
      status: [
        'documents_pending',
        'draft',
        'ready_to_submit',
        'submitted',
        'authority_review',
        'approved',
      ],
      deadlineDate: '2026-08-12',
      deadlinePeriod: 'morning',
    },
  );
});

test('application targeting accepts one UUID and resets targeted reads to the first page', () => {
  const caseId = '77777777-7777-4777-8777-777777777777';
  assert.deepEqual(parseApplicationFilters({ case: [caseId, 'ignored'], page: '9' }), {
    id: caseId,
  });
  assert.deepEqual(parseApplicationFilters({ case: 'not-a-uuid' }), {});

  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /caseId:\s*filters\.id/);
  assert.match(source, /filters\.id\s*\?\s*1\s*:\s*parseApplicationPage/);
});

test('application pagination normalizes repeated page params and preserves active filters', () => {
  assert.equal(parseApplicationPage(['2', '999']), 2);
  assert.equal(parseApplicationPage('0'), 1);
  assert.equal(parseApplicationPage('bad'), 1);
  assert.equal(
    applicationPageHref(
      'acme',
      {
        status: ['documents_pending', 'submitted'],
        assigned_to: '11111111-1111-4111-8111-111111111111',
        service_type: 'Golden visa',
      },
      3,
    ),
    '/t/acme/applications?status=documents_pending%2Csubmitted&owner=11111111-1111-4111-8111-111111111111&serviceType=Golden+visa&page=3',
  );
});

test('dashboard application metric round-trips owner and service filters', () => {
  const filters = parseApplicationFilters({
    view: 'open',
    owner: '11111111-1111-4111-8111-111111111111',
    serviceType: 'Golden visa',
  });
  const href = applicationPageHref('acme', filters, 2);
  assert.equal(
    href,
    '/t/acme/applications?status=documents_pending%2Cdraft%2Cready_to_submit%2Csubmitted%2Cauthority_review%2Capproved&owner=11111111-1111-4111-8111-111111111111&serviceType=Golden+visa&page=2',
  );
  assert.deepEqual(
    parseApplicationFilters(Object.fromEntries(new URL(href, 'https://mandoob.test').searchParams)),
    filters,
  );
});

test('applications workspace has the required table contract and Dubai date display', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  const statusActions = readFileSync(statusActionsPath, 'utf8');
  assert.match(page, /<form[^>]+method="get"/);
  assert.match(page, /ApplicationCreateForm/);
  for (const heading of ['client', 'service', 'status', 'owner', 'slaDue', 'action']) {
    assert.match(table, new RegExp(`labels\\.${heading}`));
  }
  assert.match(statusActions, /focus-visible:ring/);
  assert.match(table, /updateApplicationFormAction\.bind/);
  assert.match(table, /timeZone:\s*'Asia\/Dubai'/);
  assert.match(table, /locale:\s*string/);
  assert.doesNotMatch(table, /name="completed_at"/);
});

test('application mutation forms expose pending and accessible result feedback without casts', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  const createForm = readFileSync(createFormPath, 'utf8');
  const statusActions = readFileSync(statusActionsPath, 'utf8');
  for (const source of [createForm, statusActions]) {
    assert.match(source, /^'use client';/);
    assert.match(source, /useActionState/);
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /disabled=\{pending\}/);
  }
  assert.match(table, /ApplicationStatusActions/);
  assert.doesNotMatch([page, table, createForm, statusActions].join('\n'), /as never/);
});

test('application datetime labels explicitly identify Dubai time and UTC+04 in both locales', () => {
  const english = JSON.parse(readFileSync(englishMessagesPath, 'utf8')) as {
    pro: Record<string, string>;
  };
  const arabic = JSON.parse(readFileSync(arabicMessagesPath, 'utf8')) as {
    pro: Record<string, string>;
  };
  for (const key of ['applicationDueAt', 'applicationSlaDueAt']) {
    assert.match(english.pro[key], /Dubai/i);
    assert.match(english.pro[key], /UTC\+04/);
    assert.match(arabic.pro[key], /دبي/);
    assert.match(arabic.pro[key], /UTC\+04/);
  }
});

test('applications page exposes accessible bounded pagination using the DAL count', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /requestedPage\s*=\s*filters\.id\s*\?\s*1\s*:\s*parseApplicationPage/);
  assert.match(source, /page:\s*requestedPage/);
  assert.match(source, /workspace\.total/);
  assert.match(source, /<nav[^>]+aria-label=/);
  assert.match(source, /applicationPageHref\(/);
  assert.match(source, /applicationPreviousPage/);
  assert.match(source, /applicationNextPage/);
});
