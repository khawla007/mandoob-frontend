import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = source('src/app/admin/audit-logs/page.tsx');
const table = source('src/components/admin/AuditLogTable.tsx');
const css = source('src/app/globals.css');

test('Audit Logs opts into the inspected operational workspace', () => {
  assert.match(
    page,
    /admin-management-signal admin-operational-workspace audit-management-workspace/u,
  );
  assert.match(page, /admin-operational-heading/u);
});

test('Audit Log filters, kind links, and detail summaries receive scoped target geometry', () => {
  assert.match(css, /\.audit-management-workspace\s+:is\(/u);
  assert.match(css, /\.audit-management-workspace \.audit-kind-link/u);
  assert.match(css, /\.audit-management-workspace summary/u);
  assert.match(css, /min-height:\s*2\.75rem/u);
  assert.match(page, /className=\{\s*`audit-kind-link/u);
  assert.doesNotMatch(css, /\.audit-management-workspace[^}]*display:\s*none/u);
  assert.doesNotMatch(css, /\.audit-management-workspace[^}]*pointer-events:\s*none/u);
});

test('Audit table and JSON detail overflow expose localized focusable regions', () => {
  assert.match(
    page,
    /<AuditLogTable\s+rows=\{page\.rows\}\s+scrollAreaLabel=\{[\s\S]*?audit\.page\.(?:tenantAuditLog|authEvents)/u,
  );
  assert.match(
    table,
    /export async function AuditLogTable\(\{[\s\S]*?rows,[\s\S]*?scrollAreaLabel,[\s\S]*?rows: AuditLogRow\[\];[\s\S]*?scrollAreaLabel: string;/u,
  );
  assert.match(table, /<Table scrollAreaLabel=\{scrollAreaLabel\}>/u);
  assert.match(
    table,
    /<pre[\s\S]*?tabIndex=\{0\}[\s\S]*?aria-label=\{t\('audit\.table\.details'\)\}/u,
  );
  assert.match(table, /className="ms-2"/u);
  assert.doesNotMatch(table, /className="ml-2"/u);
});

test('Audit authorization, filters, loaders, and pagination remain direct', () => {
  assert.match(page, /await requireRole\('super_admin'\)/u);
  assert.match(page, /auditLogFiltersSchema\.safeParse/u);
  assert.match(page, /Promise\.all\(\[listAuditLog\(filters\), listTenants\(\)\]\)/u);
  assert.match(page, /buildHref\(sp, \{ cursor: page\.nextCursor \}\)/u);
  assert.match(
    table,
    /JSON\.stringify\(\s*\{\s*details: r\.details,\s*ip: r\.ip,\s*userAgent: r\.userAgent,\s*source: r\.source/u,
  );
});
