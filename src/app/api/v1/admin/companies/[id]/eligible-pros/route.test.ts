import assert from 'node:assert/strict';
import test from 'node:test';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const PRO = '33333333-3333-4333-8333-333333333333';

test('lookup authorizes AAL2, target, fail-closed limit, and query before data', async () => {
  const { createEligibleProsGetHandler } = await import('./route');
  for (const stop of ['auth', 'aal', 'target', 'limit', 'query'] as const) {
    const calls: string[] = [];
    const handler = createEligibleProsGetHandler({
      requireOperator: async () => {
        calls.push('auth');
        if (stop === 'auth') throw new Error('denied');
        return {
          id: ACTOR,
          role: 'admin',
          tenantId: null,
          aal: stop === 'aal' ? 'aal1' : 'aal2',
          mfaEnrolled: true,
          email: null,
        };
      },
      resolveCompany: async () => {
        calls.push('target');
        return stop === 'target' ? null : { id: COMPANY };
      },
      limit: async () => {
        calls.push('limit');
        return stop === 'limit' ? 'unavailable' : 'allowed';
      },
      list: async () => {
        calls.push('list');
        return [];
      },
    });
    const response = await handler(
      new Request(`http://localhost/api?q=${stop === 'query' ? 'x' : 'Ali'}`),
      { params: Promise.resolve({ id: COMPANY }) },
    );
    assert.notEqual(response.status, 200, stop);
    assert.equal(calls.includes('list'), false, stop);
  }
});

test('lookup makes one bounded company-aware query and strips lifecycle ids', async () => {
  const { createEligibleProsGetHandler } = await import('./route');
  const calls: unknown[] = [];
  const handler = createEligibleProsGetHandler({
    requireOperator: async () => ({
      id: ACTOR,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveCompany: async (id) => ({ id }),
    limit: async () => 'allowed',
    list: async (...args) => {
      calls.push(args);
      return [
        {
          proProfileId: PRO,
          fullName: 'Ali PRO',
          designation: null,
          department: null,
          eligibility: {
            eligible: false,
            codes: ['PRICING_TERMS_MISSING'],
            verifiedCredentialId: PRO,
            pricingTermId: PRO,
            compensationTermId: null,
          },
        },
      ];
    },
  });
  const response = await handler(new Request('http://localhost/api?q=%20%20Ali%20%20&limit=20'), {
    params: Promise.resolve({ id: COMPANY }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[COMPANY, 'Ali', 20, ACTOR]]);
  const text = await response.text();
  assert.doesNotMatch(
    text,
    /verifiedCredentialId|pricingTermId|compensationTermId|storagePath|cipher/u,
  );
  assert.match(text, /PRICING_TERMS_MISSING/u);
});

test('lookup fails closed with a sanitized response when the limiter is unavailable', async () => {
  const { createEligibleProsGetHandler } = await import('./route');
  const handler = createEligibleProsGetHandler({
    requireOperator: async () => ({
      id: ACTOR,
      role: 'admin',
      tenantId: null,
      aal: 'aal2',
      mfaEnrolled: true,
      email: null,
    }),
    resolveCompany: async (id) => ({ id }),
    limit: async () => {
      throw new Error('limiter credentials leaked');
    },
    list: async () => {
      throw new Error('must not run');
    },
  });
  const response = await handler(new Request('http://localhost/api?q=Ali'), {
    params: Promise.resolve({ id: COMPANY }),
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /credentials leaked/u);
});
