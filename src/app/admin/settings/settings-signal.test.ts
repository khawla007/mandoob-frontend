import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const layout = source('src/app/admin/settings/layout.tsx');
const profile = source('src/app/admin/settings/page.tsx');
const security = source('src/app/admin/settings/security/page.tsx');
const tabs = source('src/components/account/SettingsTabs.tsx');
const profileTab = source('src/components/account/ProfileTab.tsx');
const profileForm = source('src/components/account/ProfileGeneralForm.tsx');
const securityTab = source('src/components/account/SecurityTab.tsx');
const mfaTab = source('src/components/account/MfaTab.tsx');
const actions = source('src/app/account/actions.ts');
const css = source('src/app/globals.css');
const adminLayout = source('src/app/admin/layout.tsx');
const en = JSON.parse(source('src/messages/en.json'));
const ar = JSON.parse(source('src/messages/ar.json'));

test('Admin Settings opts both routes into the operational workspace', () => {
  assert.match(
    layout,
    /admin-management-signal admin-operational-workspace settings-management-workspace/u,
  );
  assert.match(layout, /admin-operational-heading/u);
  assert.match(layout, /ariaLabel=\{t\('tabsLabel'\)\}/u);
  assert.match(security, /settings-security-grid grid gap-6 lg:grid-cols-2/u);
  assert.match(profile, /<ProfileTab selectContentClassName="settings-management-select" \/>/u);
});

test('Settings navigation and scoped controls meet localized geometry contracts', () => {
  assert.match(tabs, /ariaLabel = 'Settings sections'/u);
  assert.match(tabs, /<nav aria-label=\{ariaLabel\}/u);
  assert.equal(en.admin.settings.layout.tabsLabel.length > 0, true);
  assert.equal(ar.admin.settings.layout.tabsLabel.length > 0, true);
  assert.match(css, /\.settings-management-workspace nav a/u);
  assert.match(css, /\.settings-management-workspace[\s\S]*?min-height: 2\.75rem/u);
  assert.match(css, /\.settings-security-grid > section/u);
  assert.match(css, /\.settings-management-select \[data-slot='select-item'\]/u);
  assert.match(profileTab, /selectContentClassName\?: string/u);
  assert.match(profileForm, /<SelectContent className=\{selectContentClassName\}>/u);
});

test('Admin authorization and existing profile, password and MFA contracts remain direct', () => {
  assert.match(adminLayout, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(adminLayout, /await requireMfaEnrolled\(session\)/u);
  assert.match(adminLayout, /await requireAal2\(session\)/u);
  assert.match(profileTab, /const profile = await readSelfProfile\(\)/u);
  assert.match(securityTab, /<PasswordChangeForm \/>/u);
  assert.match(mfaTab, /await supabase\.auth\.mfa\.listFactors\(\)/u);
  assert.match(actions, /export async function updateProfileAction/u);
  assert.match(actions, /export async function changePasswordAction/u);
  assert.match(actions, /export async function enrollMfaAction/u);
  assert.match(actions, /export async function finalizeMfaEnrollmentAction/u);
  assert.match(actions, /export async function removeMfaFactorAction/u);
});
