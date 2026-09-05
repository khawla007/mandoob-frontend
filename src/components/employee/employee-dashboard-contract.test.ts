import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const route = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(employee)', ...parts), 'utf8');

test('every Employee page directly authorizes its active own record', () => {
  for (const parts of [
    ['employee/dashboard/page.tsx'],
    ['employee/profile/page.tsx'],
    ['employee/identity/page.tsx'],
    ['employee/documents/page.tsx'],
    ['employee/renewals/page.tsx'],
    ['employee/settings/page.tsx'],
    ['employee/settings/security/page.tsx'],
  ]) {
    assert.match(route(...parts), /authorizeEmployeePortalRead\(/u, parts.join('/'));
  }
});

test('overview keeps the eight reference regions and exact four-signal order', () => {
  const source = route('employee/dashboard/page.tsx');
  const regions = [
    'employee-masthead',
    'employee-signal-strip',
    'employee-identity-panels',
    'employee-documents-panel',
    'employee-renewals-panel',
    'employee-notifications-panel',
    'employee-quick-actions',
    'employee-pro-help',
  ];
  let cursor = -1;
  for (const region of regions) {
    const next = source.indexOf(region);
    assert.ok(next > cursor, `${region} must follow the prior region`);
    cursor = next;
  }
  assert.match(source, /EMPLOYEE_SIGNAL_ORDER\.map/u);
  assert.match(source, /renewals\?\.kind === 'error'/u);
});

test('Employee navigation exposes profile, identity, documents, renewals and settings without P2.10 routes', () => {
  const source = readFileSync(join(process.cwd(), 'src/lib/shell/nav-employee.ts'), 'utf8');
  for (const segment of ['/profile', '/identity', '/documents', '/renewals', '/settings']) {
    assert.match(source, new RegExp(segment.replace('/', '\\/'), 'u'));
  }
  assert.doesNotMatch(source, /\/notifications|\/messages/u);
  assert.match(source, /encodeURIComponent\(slug\)/u);
});

test('Employee routes do not render identity imagery, fake lifecycle validity or raw identifier fields', () => {
  const source = [
    route('employee/dashboard/page.tsx'),
    route('employee/identity/page.tsx'),
    route('employee/profile/page.tsx'),
  ].join('\n');
  assert.doesNotMatch(source, /next\/image|<img|identity-card|passport image|\bValid\b/u);
  assert.doesNotMatch(source, /passportNo\b|visaNo\b|emiratesId\b/u);
  const layout = route('layout.tsx');
  assert.doesNotMatch(layout, /session\.email/u);
  assert.match(layout, /common\.accountLabel/u);
});

test('Employee module routes provide localized loading and sanitized retry boundaries', () => {
  for (const segment of ['profile', 'identity', 'documents', 'renewals']) {
    const loading = route(`employee/${segment}/loading.tsx`);
    const error = route(`employee/${segment}/error.tsx`);
    assert.match(loading, /getTranslations/u);
    assert.match(error, /DashboardRouteState/u);
    assert.doesNotMatch(error, /error\.message|error\.digest/u);
  }
});

test('Employee settings do not serialize shared account PII forms or raw-message actions', () => {
  const source = [
    route('employee/settings/page.tsx'),
    route('employee/settings/security/page.tsx'),
  ].join('\n');
  assert.doesNotMatch(source, /ProfileTab|SecurityTab|ProfileForm|PasswordChangeForm/u);
  assert.doesNotMatch(source, /@\/app\/account\/actions/u);
});
