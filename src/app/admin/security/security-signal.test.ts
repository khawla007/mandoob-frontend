import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const page = source('src/app/admin/security/page.tsx');
const locked = source('src/components/admin/LockedAccountsTable.tsx');

test('Security opts into the inspected operational workspace', () => {
  assert.match(
    page,
    /admin-management-signal admin-operational-workspace security-management-workspace/u,
  );
  assert.match(page, /admin-operational-heading/u);
});

test('all populated Security tables expose localized keyboard-accessible scroll regions', () => {
  assert.match(locked, /<Table scrollAreaLabel=\{t\('security\.lockedAccountsTitle'\)\}>/u);
  assert.match(page, /<Table scrollAreaLabel=\{t\('security\.topIpsTitle'\)\}>/u);
  assert.match(page, /<Table scrollAreaLabel=\{t\('security\.mfaFailuresTitle'\)\}>/u);
});

test('Security authorization, dashboard loader, and unlock confirmation contract remain direct', () => {
  assert.match(page, /await requireRole\('super_admin'\)/u);
  assert.match(page, /await loadSecurityDashboard\(\)/u);
  assert.match(page, /<LockedAccountsTable rows=\{data\.lockedAccounts\} \/>/u);
  assert.match(locked, /if \(!confirm\(t\('user\.lockedAccounts\.confirmUnlock'/u);
  assert.match(locked, /unlockAccountAction\(\{ key \}\)/u);
  assert.match(locked, /disabled=\{pending\}/u);
});
