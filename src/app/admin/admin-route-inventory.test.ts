import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

const adminRoot = join(process.cwd(), 'src/app/admin');

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? pageFiles(path) : entry.name === 'page.tsx' ? [path] : [];
  });
}

function routeFor(path: string): string {
  const directory = relative(adminRoot, join(path, '..')).split(sep).join('/');
  return directory ? `/admin/${directory}` : '/admin';
}

const expected = [
  '/admin',
  '/admin/audit-logs',
  '/admin/blog',
  '/admin/blog/[id]',
  '/admin/blog/attributes',
  '/admin/blog/categories',
  '/admin/blog/new',
  '/admin/blog/tags',
  '/admin/calendar',
  '/admin/communications',
  '/admin/companies',
  '/admin/companies/[id]',
  '/admin/companies/[id]/onboarding',
  '/admin/companies/[id]/onboarding/[section]',
  '/admin/companies/new',
  '/admin/compliance',
  '/admin/cost-data',
  '/admin/documents',
  '/admin/employees',
  '/admin/erasure-requests',
  '/admin/erasure-requests/[id]',
  '/admin/finance',
  '/admin/leads',
  '/admin/meetings',
  '/admin/notifications',
  '/admin/pages',
  '/admin/pages/[id]',
  '/admin/pages/new',
  '/admin/plans',
  '/admin/pro-firms',
  '/admin/pro-firms/[id]',
  '/admin/pro-firms/new',
  '/admin/questionnaire',
  '/admin/registrations',
  '/admin/registrations/[registrationId]',
  '/admin/renewals',
  '/admin/reports',
  '/admin/security',
  '/admin/sessions',
  '/admin/settings',
  '/admin/settings/security',
  '/admin/system-status',
  '/admin/tasks',
  '/admin/users',
  '/admin/users/[id]',
  '/admin/users/[id]/edit',
  '/admin/users/new',
  '/admin/whatsapp-templates',
].sort();

test('the Admin page inventory is exact and no actual route is silently omitted', () => {
  const actual = pageFiles(adminRoot).map(routeFor).sort();
  assert.equal(actual.length, 48);
  assert.deepEqual(actual, expected);
});

test('only the three retired PRO registry routes are compatibility redirects', () => {
  const redirectRoutes = [
    ['src/app/admin/pro-firms/page.tsx', "/admin/companies'"],
    ['src/app/admin/pro-firms/new/page.tsx', "/admin/companies/new'"],
    ['src/app/admin/pro-firms/[id]/page.tsx', '/admin/companies?tenant='],
  ] as const;
  for (const [path, target] of redirectRoutes) {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    assert.match(source, /redirect\(/u);
    assert.equal(source.includes(target), true);
  }
});

test('the overview remains a regression control rather than an aligned module', () => {
  const overview = readFileSync(join(adminRoot, 'page.tsx'), 'utf8');
  assert.doesNotMatch(overview, /admin-operational-workspace/u);
});
