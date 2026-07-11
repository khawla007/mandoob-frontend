import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

const validBody = {
  answers: {
    fullName: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '+971501234567',
    nationality: 'India',
    activity: 'consulting',
    preferredNames: ['Aisha Consulting FZE', 'Aisha Advisory FZE', 'Aisha Services FZE'],
    businessSummary: 'Business setup and management consulting.',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    shareholderCount: 1,
    investorVisaCount: 0,
    employeeVisaCount: 0,
    familyVisaCount: 0,
    officeType: 'none',
    addOns: ['bank_account'],
    documentReadiness: 'ready',
  },
  estimateData: { reference: 'EST-1234567890' },
};

test('public questionnaire API rejects invalid submissions with structured validation errors', async () => {
  const { handleQuestionnairePost } = await import('./handler');
  const response = await handleQuestionnairePost(
    new Request('https://mandoob.test/api/v1/public/questionnaire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: { email: 'not-email' } }),
    }) as never,
    {
      consume: async () => true,
      createLead: async () => {
        throw new Error('should not create lead');
      },
    },
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, 'INVALID_INPUT');
  assert.ok(Array.isArray(body.details.issues));
});

test('public questionnaire API returns lead reference on successful anonymous submit', async () => {
  const { handleQuestionnairePost } = await import('./handler');
  const response = await handleQuestionnairePost(
    new Request('https://mandoob.test/api/v1/public/questionnaire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    }) as never,
    {
      consume: async () => true,
      createLead: async () => ({
        leadId: 'lead-1',
        stage: 'new',
        assignedTenantId: null,
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    leadId: 'lead-1',
    stage: 'new',
    assignedTenantId: null,
  });
});

test('public questionnaire API applies public IP rate limiting before validation', async () => {
  const { handleQuestionnairePost } = await import('./handler');
  const response = await handleQuestionnairePost(
    new Request('https://mandoob.test/api/v1/public/questionnaire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    }) as never,
    {
      consume: async () => false,
      createLead: async () => {
        throw new Error('should not create lead');
      },
    },
  );

  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.code, 'RATE_LIMITED');
});
