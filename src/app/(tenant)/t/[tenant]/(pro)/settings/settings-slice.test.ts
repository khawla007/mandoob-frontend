import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');
const settingsPage = read('src/app/(tenant)/t/[tenant]/(pro)/settings/page.tsx');
const billingPage = read('src/app/(tenant)/t/[tenant]/(pro)/settings/billing/page.tsx');
const settingsActions = read('src/app/(tenant)/t/[tenant]/(pro)/settings/actions.ts');
const billingActions = read('src/app/(tenant)/t/[tenant]/(pro)/settings/billing/actions.ts');

test('settings authorizes, checks active tenancy, and verifies the live assignment before settings reads', () => {
  const boundary = settingsPage.indexOf('requireProTenantRouteAccess(slug)');
  const active = settingsPage.indexOf('requireActiveTenant(tenant.id)');
  const assignment = settingsPage.indexOf('readAssignedCompanyForPro(session.id, slug)');
  const settingsRead = settingsPage.indexOf('getTenantSettingsSnapshot(tenant.id)');
  assert.ok(boundary >= 0 && boundary < active);
  assert.ok(active < assignment);
  assert.ok(assignment < settingsRead);
});

test('settings mutations verify the active assigned company before service-role work', () => {
  const authorization = settingsActions.indexOf('requireProTenantRouteAccess(slug)');
  const active = settingsActions.indexOf('requireActiveTenant(tenant.id)');
  const assignment = settingsActions.indexOf('readAssignedCompanyForPro(session.id, tenant.slug)');
  const serviceRole = settingsActions.indexOf('const admin = createSupabaseServiceRoleClient()');
  assert.ok(authorization >= 0 && authorization < active);
  assert.ok(active < assignment);
  assert.ok(assignment < serviceRole);
});

test('billing has no local plan catalog, pricing, checkout, portal, or cancellation controls', () => {
  assert.doesNotMatch(billingPage, /const plans\s*=/u);
  assert.doesNotMatch(billingPage, /\bStarter\b|\bProfessional\b|\bEnterprise\b|\bUSD\b/u);
  assert.doesNotMatch(
    billingPage,
    /startCheckoutAction|openBillingPortalAction|cancelSubscriptionAction/u,
  );
  assert.match(billingPage, /billing\.planSelectionUnavailable/u);
  assert.match(billingPage, /<Button type="button" disabled>/u);
  assert.match(billingPage, /getBillingSubscriptionSnapshot\(tenant.id\)/u);
});

test('billing localizes known plan and interval enums and hides unknown values', () => {
  assert.match(billingPage, /billingPlanKey\(snapshot\.data\.plan\)/u);
  assert.match(billingPage, /billingIntervalKey\(snapshot\.data\.interval\)/u);
  assert.doesNotMatch(billingPage, /\{snapshot\.data\.plan\}/u);
  assert.doesNotMatch(billingPage, /\{snapshot\.data\.interval\}/u);

  for (const locale of ['en', 'ar']) {
    const billing = JSON.parse(read(`src/messages/${locale}.json`)).pro.settings.billing;
    for (const plan of ['starter', 'professional', 'enterprise']) {
      assert.equal(typeof billing.plans?.[plan], 'string', `${locale}.${plan}`);
      assert.notEqual(billing.plans[plan], plan, `${locale}.${plan}`);
    }
    for (const interval of ['month', 'year']) {
      assert.equal(typeof billing.intervals?.[interval], 'string', `${locale}.${interval}`);
      assert.notEqual(billing.intervals[interval], interval, `${locale}.${interval}`);
    }
    assert.equal(typeof billing.plans?.unknown, 'string', `${locale}.plans.unknown`);
    assert.equal(typeof billing.intervals?.unknown, 'string', `${locale}.intervals.unknown`);
  }
  assert.match(billingPage, /:\s*'unknown'/u);
});

test('billing mutations are unavailable without a complete catalog and safe provider contract', () => {
  assert.doesNotMatch(
    billingActions,
    /createCheckoutSession|createBillingPortalSession|subscriptions\.update/u,
  );
  assert.match(billingActions, /BILLING_ACTIONS_UNAVAILABLE/u);
});

test('settings and billing render only redacted source contracts', () => {
  const settingsData = read('src/lib/data/tenant-settings.ts');
  const billingData = read('src/lib/data/tenant-billing.ts');
  for (const secret of ['password_encrypted:', 'access_token_encrypted:']) {
    assert.doesNotMatch(settingsData, new RegExp(secret, 'u'));
  }
  for (const identifier of ['stripe_customer_id', 'stripe_price_id', 'stripe_subscription_id']) {
    assert.doesNotMatch(billingData, new RegExp(identifier, 'u'));
  }
  for (const component of [
    'src/components/pro/SettingsBrandingCard.tsx',
    'src/components/pro/SettingsContactCard.tsx',
    'src/components/pro/SettingsSmtpCard.tsx',
    'src/components/pro/SettingsWhatsAppCard.tsx',
  ]) {
    assert.doesNotMatch(read(component), /\$\{r\.code\}/u, component);
  }
});

test('settings routes include compact loading and localized retry states', () => {
  const loading = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/settings/loading.tsx');
  const error = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/settings/error.tsx');
  const billingLoading = join(
    root,
    'src/app/(tenant)/t/[tenant]/(pro)/settings/billing/loading.tsx',
  );
  assert.ok(existsSync(loading));
  assert.ok(existsSync(error));
  assert.ok(existsSync(billingLoading));
  assert.match(readFileSync(error, 'utf8'), /t\('loadFailed'\)/u);
  assert.match(readFileSync(error, 'utf8'), /t\('retry'\)/u);
  for (const file of [loading, billingLoading]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /getTranslations\('pro\.settings'\)/u);
    assert.doesNotMatch(source, /aria-label="Loading/u);
  }
});

test('provider cards show source-backed configuration states, never connection or verification claims', () => {
  for (const file of [
    'src/components/pro/SettingsSmtpCard.tsx',
    'src/components/pro/SettingsWhatsAppCard.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /deriveProviderState/u, file);
    assert.match(source, /providerStatus\.\$\{status\}/u, file);
    assert.doesNotMatch(source, /connected|verified/iu, file);
  }
});

test('English and Arabic settings catalogs have the same top-level settings keys', () => {
  const en = JSON.parse(read('src/messages/en.json')).pro.settings;
  const ar = JSON.parse(read('src/messages/ar.json')).pro.settings;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ar).sort());
  for (const key of ['title', 'description', 'context', 'providerStatus', 'billing']) {
    assert.ok(key in en, `en.${key}`);
    assert.ok(key in ar, `ar.${key}`);
  }
  assert.equal(
    en.billing.planSelectionUnavailable,
    'Plan selection unavailable — Phase 3 contract required',
  );
});
