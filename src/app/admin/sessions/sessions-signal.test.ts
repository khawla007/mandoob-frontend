import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = source('src/app/admin/sessions/page.tsx');
const table = source('src/components/admin/SessionsTable.tsx');
const css = source('src/app/globals.css');

test('Sessions opts into the inspected operational workspace', () => {
  assert.match(
    page,
    /admin-management-signal admin-operational-workspace session-management-workspace/u,
  );
  assert.match(page, /admin-operational-heading/u);
});

test('Sessions controls and destructive action receive scoped target geometry', () => {
  assert.match(css, /\.session-management-workspace select/u);
  assert.match(css, /\.dark \.session-management-workspace button\[data-variant='destructive'\]/u);
  assert.match(css, /min-height:\s*2\.75rem/u);
  assert.doesNotMatch(css, /\.session-management-workspace[^}]*display:\s*none/u);
  assert.doesNotMatch(css, /\.session-management-workspace[^}]*pointer-events:\s*none/u);
});

test('Sessions table keeps a localized keyboard-accessible scroll region', () => {
  assert.match(table, /<Table scrollAreaLabel=\{t\('sessions\.activeTitle'\)\}>/u);
});

test('Sessions authorization, loaders, filters, and revoke confirmation contracts remain direct', () => {
  assert.match(page, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(page, /sessionsFiltersSchema\.parse/u);
  assert.match(page, /listActiveSessions\(\{/u);
  assert.match(page, /listTenants\(\)/u);
  assert.match(page, /<SessionsTable rows=\{rows\} viewerUserId=\{session\.id\} \/>/u);
  assert.match(table, /if \(!confirm\(t\('user\.sessions\.confirmRevokeOne'/u);
  assert.match(
    table,
    /revokeSessionAction\(\{ sessionId: row\.sessionId, userId: row\.userId \}\)/u,
  );
  assert.match(table, /if \(!confirm\(t\('user\.sessions\.confirmRevokeAll'/u);
  assert.match(table, /revokeAllSessionsForUserAction\(\{ userId: row\.userId \}\)/u);
});
