import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const list = source('src/app/admin/users/page.tsx');
const create = source('src/app/admin/users/new/page.tsx');
const detail = source('src/app/admin/users/[id]/page.tsx');
const edit = source('src/app/admin/users/[id]/edit/page.tsx');
const roleDialog = source('src/components/admin/ChangeRolePanel.tsx');
const statusDialog = source('src/components/admin/ChangeStatusPanel.tsx');
const mfaDialog = source('src/components/admin/ResetMfaButton.tsx');
const css = source('src/app/globals.css');

test('all five rendered Users surfaces opt into the inspected operational workspace', () => {
  assert.equal(
    list.match(/admin-management-signal admin-operational-workspace user-management-workspace/gu)
      ?.length,
    2,
  );
  for (const page of [create, detail, edit]) {
    assert.match(
      page,
      /admin-management-signal admin-operational-workspace user-management-workspace/u,
    );
  }

  assert.equal(list.match(/admin-operational-heading/gu)?.length, 2);
  for (const page of [create, detail, edit]) assert.match(page, /admin-operational-heading/u);
});

test('Users fields and table links receive scoped target geometry', () => {
  assert.match(
    css,
    /\.user-management-workspace\s+:is\(input:not\(\[type='hidden'\]\):not\(\[type='checkbox'\]\):not\(\[type='radio'\]\), textarea\)/u,
  );
  assert.match(css, /\.user-management-workspace table a/u);
  assert.match(css, /min-height:\s*2\.75rem/u);
  assert.doesNotMatch(css, /\.user-management-workspace[^}]*select/u);
  assert.doesNotMatch(css, /\.user-management-workspace[^}]*display:\s*none/u);
  assert.doesNotMatch(css, /\.user-management-workspace[^}]*pointer-events:\s*none/u);
});

test('account and security dialogs opt into scoped geometry and retain accessible names', () => {
  for (const dialog of [roleDialog, statusDialog, mfaDialog]) {
    assert.match(dialog, /user-management-dialog/u);
  }
  assert.equal(roleDialog.match(/user-management-select/gu)?.length, 2);
  assert.equal(statusDialog.match(/user-management-select/gu)?.length, 1);
  assert.match(roleDialog, /SelectTrigger aria-label=\{t\('user\.roleChange\.newRoleLabel'\)\}/u);
  assert.match(
    statusDialog,
    /SelectTrigger aria-label=\{t\('user\.statusChange\.targetStatusLabel'\)\}/u,
  );
  assert.match(mfaDialog, /aria-label=\{t\('user\.fields\.reason'\)\}/u);
});

test('Users authorization and data orchestration remain direct', () => {
  assert.match(list, /await requirePlatformOperator\(\)/u);
  assert.match(create, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(detail, /await requirePlatformOperator\(\)/u);
  assert.match(edit, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(list, /listUsersWithProfiles\(args\)/u);
  assert.match(list, /listProRegistry\(actorId, filters\)/u);
  assert.match(detail, /loadProLifecyclePage\(operator\.id, id, timelineSelection\.cursor\)/u);
  assert.match(edit, /getUserForEdit\(id,/u);
});
