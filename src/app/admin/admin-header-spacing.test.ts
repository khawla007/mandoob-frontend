import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const directSpacingSurfaces = [
  'src/app/admin/leads/page.tsx',
  'src/app/admin/finance/page.tsx',
  'src/app/admin/whatsapp-templates/page.tsx',
  'src/app/admin/registrations/page.tsx',
  'src/app/admin/documents/page.tsx',
  'src/app/admin/employees/page.tsx',
  'src/app/admin/renewals/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/admin/compliance/page.tsx',
  'src/app/admin/system-status/page.tsx',
  'src/app/admin/questionnaire/page.tsx',
  'src/app/admin/plans/page.tsx',
  'src/app/admin/companies/page.tsx',
  'src/app/admin/users/page.tsx',
  'src/app/admin/sessions/page.tsx',
  'src/app/admin/security/page.tsx',
  'src/app/admin/audit-logs/page.tsx',
  'src/app/admin/erasure-requests/page.tsx',
  'src/app/admin/settings/layout.tsx',
] as const;

const sharedUnavailableSurfaces = [
  'src/app/admin/tasks/page.tsx',
  'src/app/admin/calendar/page.tsx',
  'src/app/admin/meetings/page.tsx',
  'src/app/admin/communications/page.tsx',
  'src/app/admin/notifications/page.tsx',
] as const;

test('every primary Admin surface after Editorial declares the 1.5rem header rhythm', () => {
  for (const path of directSpacingSurfaces) {
    assert.match(read(path), /space-y-6/u, path);
  }

  for (const path of sharedUnavailableSurfaces) {
    assert.match(read(path), /OperationalUnavailableRoute/u, path);
  }

  assert.match(
    read('src/components/operations/OperationalUnavailableWorkspace.tsx'),
    /className="signal-dashboard min-w-0 space-y-6"/u,
  );
});

test('scoped Business and operational heading styles do not erase the declared spacing', () => {
  const css = read('src/app/globals.css');
  const leadsRule = css.match(
    /\.leads-management-workspace \.leads-management-heading \{([^}]*)\}/u,
  );
  const operationalRule = css.match(
    /\.admin-operational-workspace \.admin-operational-heading \{([^}]*)\}/u,
  );

  assert.ok(leadsRule?.[1], 'Leads heading rule must exist');
  assert.ok(operationalRule?.[1], 'Operational heading rule must exist');
  assert.doesNotMatch(leadsRule[1], /margin-bottom:\s*0/u);
  assert.doesNotMatch(operationalRule[1], /margin-bottom:\s*0/u);
});
