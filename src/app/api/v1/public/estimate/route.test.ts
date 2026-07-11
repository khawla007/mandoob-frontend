import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';

async function postEstimate(request: Request) {
  const { seededCostDataRows } = await import('@/lib/estimator/seed-data');
  const { handleEstimatePost } = await import('./handler');
  return handleEstimatePost(request as never, {
    consume: async () => true,
    listRows: async () => seededCostDataRows,
  });
}

test('public estimate API returns quote JSON and handoff URL without auth', async () => {
  const response = await postEstimate(
    new Request('https://mandoob.test/api/v1/public/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jurisdiction: 'free_zone',
        authority: 'DMCC',
        emirate: 'dubai',
        activityKey: 'consulting',
        shareholderCount: 2,
        visaCount: 1,
        legalStructure: 'fz_llc',
        officeType: 'flexi',
        addOns: ['bank_account'],
      }),
    }) as never,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.estimate.reference, /^EST-[A-Z0-9]{10}$/);
  assert.equal(body.estimate.currency, 'AED');
  assert.ok(body.estimate.oneTimeTotalMinor > 0);
  assert.ok(body.estimate.annualTotalMinor > 0);
  assert.match(body.handoffUrl, /^\/apply\?/);
  assert.equal(body.createdLead, undefined);
});

test('public estimate API rejects invalid estimator input', async () => {
  const response = await postEstimate(
    new Request('https://mandoob.test/api/v1/public/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jurisdiction: 'free_zone',
        authority: 'DMCC',
        activityKey: 'consulting',
        shareholderCount: 0,
        visaCount: 1,
        legalStructure: 'fz_llc',
        officeType: 'flexi',
      }),
    }) as never,
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'INVALID_INPUT');
});
