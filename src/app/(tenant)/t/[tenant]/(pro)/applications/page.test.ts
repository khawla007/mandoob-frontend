import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import { authorizeApplicationsRead } from './page-authorization';
import {
  applicationPageHref,
  parseApplicationFilters,
  parseApplicationPage,
  type ApplicationSearchParams,
} from './page-logic';

const pagePath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx');
const tablePath = join(process.cwd(), 'src/components/pro/applications/ApplicationsTable.tsx');
const createFormPath = join(
  process.cwd(),
  'src/components/pro/applications/ApplicationCreateForm.tsx',
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
  assert.doesNotMatch(logic, /search\.owner|assigned_to/);
  assert.match(source, /listServiceCaseWorkspace\(/);
  assert.doesNotMatch(source, new RegExp(`listServiceCase${['Cli', 'ents'].join('')}\\(`, 'u'));
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

test('repeated status and service params choose the first value while owner params are ignored', () => {
  const parsed = parseApplicationFilters({
    status: ['documents_pending,submitted', 'cancelled'],
    owner: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    serviceType: ['Golden visa', 'License'],
  } as ApplicationSearchParams & { owner: string[] });
  assert.deepEqual(parsed, {
    status: ['documents_pending', 'submitted'],
    service_type: 'Golden visa',
  });
  assert.deepEqual(
    parseApplicationFilters({
      status: ['bad', 'submitted'],
      owner: [],
    } as ApplicationSearchParams & {
      owner: string[];
    }),
    {},
  );
});

test('dashboard application filters expand open status and preserve Dubai deadline period', () => {
  assert.deepEqual(
    parseApplicationFilters({
      view: 'open',
      owner: '11111111-1111-4111-8111-111111111111',
      serviceType: 'Golden visa',
    } as ApplicationSearchParams & { owner: string }),
    {
      status: [
        'documents_pending',
        'draft',
        'ready_to_submit',
        'submitted',
        'authority_review',
        'approved',
      ],
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

test('a valid explicit status remains in force with a valid deadline filter', () => {
  assert.deepEqual(
    parseApplicationFilters({
      status: 'submitted',
      date: '2026-08-12',
      period: 'morning',
      eventTypes: 'case',
    }),
    {
      status: ['submitted'],
      deadlineDate: '2026-08-12',
      deadlinePeriod: 'morning',
    },
  );
});

test('application pagination normalizes repeated page params and preserves active filters', () => {
  assert.equal(parseApplicationPage(['2', '999']), 2);
  assert.equal(parseApplicationPage('0'), 1);
  assert.equal(parseApplicationPage('bad'), 1);
  assert.equal(parseApplicationPage('2pages'), 1);
  assert.equal(parseApplicationPage('9007199254740992'), 1);
  assert.equal(
    applicationPageHref(
      'acme',
      {
        status: ['documents_pending', 'submitted'],
        service_type: 'Golden visa',
      },
      3,
    ),
    '/t/acme/applications?status=documents_pending%2Csubmitted&serviceType=Golden+visa&page=3',
  );
});

test('dashboard application metric round-trips service filters without an owner scope', () => {
  const filters = parseApplicationFilters({
    view: 'open',
    serviceType: 'Golden visa',
  });
  const href = applicationPageHref('acme', filters, 2);
  assert.equal(
    href,
    '/t/acme/applications?status=documents_pending%2Cdraft%2Cready_to_submit%2Csubmitted%2Cauthority_review%2Capproved&serviceType=Golden+visa&page=2',
  );
  assert.deepEqual(
    parseApplicationFilters(Object.fromEntries(new URL(href, 'https://mandoob.test').searchParams)),
    filters,
  );
});

test('applications workspace has the required read-only queue contract and Dubai date display', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  assert.match(page, /<form[^>]+method="get"/);
  for (const heading of [
    'title',
    'service',
    'priority',
    'status',
    'blockers',
    'slaDue',
    'updatedAt',
    'action',
  ]) {
    assert.match(table, new RegExp(`labels\\.${heading}`));
  }
  assert.match(table, /row\.blockedReason/);
  assert.match(table, /row\.updatedAt/);
  assert.match(table, /timeZone:\s*'Asia\/Dubai'/);
  assert.match(table, /locale:\s*string/);
  assert.match(page, /applicationMutationsUnavailable/);
  assert.match(table, /labels\.mutationsUnavailable/);
  assert.doesNotMatch([page, table].join('\n'), /ApplicationCreateForm|ApplicationStatusActions/);
  assert.doesNotMatch(
    [page, table].join('\n'),
    /useActionState|createApplicationFormAction|updateApplicationFormAction/,
  );
});

test('applications presents truthful filtered and current-page counts with distinct no-results copy', () => {
  const page = readFileSync(pagePath, 'utf8');
  assert.match(page, /workspace\.total/);
  assert.match(page, /cases\.length/);
  assert.match(page, /blockedReason/);
  assert.match(page, /applicationNoResults/);
  assert.match(page, /applicationsEmpty/);
  assert.match(page, /resetApplicationFilters/);
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

test('assigned-company applications remove owner and company controls while retaining validated service case filters', () => {
  const page = readFileSync(pagePath, 'utf8');
  const logic = readFileSync(logicPath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  const createForm = readFileSync(createFormPath, 'utf8');

  for (const source of [page, logic, table, createForm]) {
    assert.doesNotMatch(source, /applicationOwner|applicationUnassigned|allApplicationOwners/);
    assert.doesNotMatch(source, /ownerName|assigned_to/);
  }
  assert.doesNotMatch([table, createForm].join('\n'), /companyName/);
  assert.doesNotMatch(logic, /search\.owner|params\.set\('owner'/);
  assert.match(logic, /serviceCaseFilterSchema\.safeParse/);
  assert.match(logic, /service_type/);
  assert.match(logic, /deadlineDate/);
  assert.match(page, /requireActiveTenant\(tenant\.id\)/);
});

test('assigned-company queue focuses title, service, priority, status, blockers, deadlines, updated time, and actions', () => {
  const table = readFileSync(tablePath, 'utf8');
  for (const heading of [
    'title',
    'service',
    'priority',
    'status',
    'blockers',
    'slaDue',
    'updatedAt',
    'action',
  ]) {
    assert.match(table, new RegExp(`labels\\.${heading}`));
  }
  assert.match(table, /row\.blockedReason/);
  assert.match(table, /row\.updatedAt/);
  assert.doesNotMatch(table, /labels\.company|labels\.owner|labels\.unassigned/);
});
