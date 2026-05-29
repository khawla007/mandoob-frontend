import { expect, test } from '@playwright/test';

const smokeSubmission = {
  answers: {
    fullName: 'Mandoob Smoke Test',
    email: 'mandoob-smoke@example.test',
    phone: '+971500000000',
    nationality: 'Smoke Test',
    activity: 'consulting',
    preferredNames: ['Mandoob Smoke One FZE', 'Mandoob Smoke Two FZE', 'Mandoob Smoke Three FZE'],
    businessSummary: 'Automated staging smoke test for public questionnaire lead intake.',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    shareholderCount: 1,
    investorVisaCount: 0,
    employeeVisaCount: 0,
    familyVisaCount: 0,
    officeType: 'none',
    addOns: ['bank_account'],
    documentReadiness: 'ready',
    notes: 'Created by CI smoke test. Safe to delete.',
  },
  estimateData: {
    reference: 'EST-SMOKE00001',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    activity: 'consulting',
    shareholderCount: 1,
    visaCount: 0,
    officeType: 'none',
    addOns: ['bank_account'],
  },
};

test('staging public questionnaire POST returns a new lead reference', async ({ request }) => {
  const response = await request.post('/api/v1/public/questionnaire', {
    data: smokeSubmission,
    headers: {
      'content-type': 'application/json',
      'x-smoke-test': 'public-questionnaire',
    },
  });

  const responseBody = await response.json().catch(() => null);

  expect(response.status(), JSON.stringify({ status: response.status(), body: responseBody })).toBe(
    200,
  );
  expect(responseBody).toMatchObject({
    stage: 'new',
    assignedTenantId: null,
  });
  expect(responseBody).toEqual(
    expect.objectContaining({
      leadId: expect.any(String),
      stage: 'new',
    }),
  );
});
