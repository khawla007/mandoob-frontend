import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_CATALOG, evaluateCatalogAvailability, resolveProviderPrice } from './catalog';

test('demo AED catalog has the exact versioned plans and add-ons', () => {
  assert.equal(DEMO_CATALOG.key, 'p309-demo-aed-v1');
  assert.equal(DEMO_CATALOG.catalogClass, 'demo');
  assert.equal(DEMO_CATALOG.currency, 'AED');
  assert.deepEqual(DEMO_CATALOG.plans.starter, {
    monthlyAmountMinor: 19_900,
    annualAmountMinor: 199_000,
    allowances: {
      employees: 25,
      storageBytes: 5 * 1024 ** 3,
      invoices: 50,
      sms: 0,
      whatsapp: 0,
      advancedReports: false,
    },
  });
  assert.equal(DEMO_CATALOG.plans.professional.allowances.whatsapp, 500);
  assert.equal(DEMO_CATALOG.plans.enterprise.allowances.storageBytes, 100 * 1024 ** 3);
  assert.deepEqual(DEMO_CATALOG.addons.employee_pack_25, {
    allowance: 'employees',
    delta: 25,
    monthlyAmountMinor: 5_000,
    annualAmountMinor: 50_000,
  });
  assert.equal(DEMO_CATALOG.addons.storage_pack_10_gib.delta, 10 * 1024 ** 3);
  assert.equal(DEMO_CATALOG.addons.sms_pack_100.monthlyAmountMinor, 2_000);
  assert.equal(DEMO_CATALOG.addons.whatsapp_pack_100.annualAmountMinor, 30_000);
});

test('demo catalogs are always forbidden live and local catalogs are rejected in production', () => {
  assert.deepEqual(evaluateCatalogAvailability(DEMO_CATALOG, 'live', true), {
    available: false,
    reason: 'live_demo_forbidden',
  });
  assert.deepEqual(evaluateCatalogAvailability(DEMO_CATALOG, 'sandbox', false), {
    available: false,
    reason: 'provider_disabled',
  });
  assert.equal(evaluateCatalogAvailability(DEMO_CATALOG, 'sandbox', true).available, true);
  assert.equal(evaluateCatalogAvailability(DEMO_CATALOG, 'local', false).available, true);
  assert.deepEqual(
    evaluateCatalogAvailability({ ...DEMO_CATALOG, catalogClass: 'local' }, 'production', true),
    { available: false, reason: 'production_local_forbidden' },
  );
});

test('Stripe needs separate enablement and an exact mapping', () => {
  const mapping = {
    provider: 'stripe' as const,
    destination: 'sandbox' as const,
    catalogKey: DEMO_CATALOG.key,
    plan: 'professional' as const,
    cadence: 'monthly' as const,
    providerPriceId: 'price_professional_monthly',
    currency: 'AED',
    amountMinor: 49_900,
    interval: 'month' as const,
  };
  assert.deepEqual(
    resolveProviderPrice({
      catalog: DEMO_CATALOG,
      provider: 'stripe',
      destination: 'sandbox',
      plan: 'professional',
      cadence: 'monthly',
      enabled: true,
      mappings: [mapping],
    }),
    { available: true, providerPriceId: mapping.providerPriceId },
  );
  assert.equal(
    resolveProviderPrice({
      catalog: DEMO_CATALOG,
      provider: 'stripe',
      destination: 'sandbox',
      plan: 'professional',
      cadence: 'monthly',
      enabled: false,
      mappings: [mapping],
    }).available,
    false,
  );
  assert.equal(
    resolveProviderPrice({
      catalog: DEMO_CATALOG,
      provider: 'stripe',
      destination: 'sandbox',
      plan: 'professional',
      cadence: 'monthly',
      enabled: true,
      mappings: [{ ...mapping, amountMinor: 49_901 }],
    }).available,
    false,
  );
});

test('Tap availability never consults Stripe mappings', () => {
  assert.deepEqual(
    resolveProviderPrice({
      catalog: DEMO_CATALOG,
      provider: 'tap',
      destination: 'sandbox',
      plan: 'starter',
      cadence: 'annual',
      enabled: true,
      mappings: [],
    }),
    { available: true, providerPriceId: null },
  );
});
