import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

async function loadLeads() {
  return import('./leads');
}

const input = {
  answers: {
    source: 'questionnaire' as const,
    fullName: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '+971501234567',
    nationality: 'India',
    activity: 'consulting',
    preferredNames: ['Aisha Consulting FZE', 'Aisha Advisory FZE', 'Aisha Services FZE'],
    businessSummary: 'Business setup and management consulting.',
    jurisdiction: 'free_zone' as const,
    authority: 'DMCC',
    shareholderCount: 1,
    shareholderSplitSummary: null,
    investorVisaCount: 0,
    employeeVisaCount: 0,
    familyVisaCount: 0,
    officeType: 'none' as const,
    officeAreaNotes: null,
    addOns: ['bank_account' as const],
    documentReadiness: 'partial' as const,
    notes: null,
  },
  estimateData: { reference: 'EST-1234567890' },
};

test('lead routing keeps public questionnaire leads platform-unassigned in v1', async () => {
  const { selectTenantForQuestionnaireLead } = await loadLeads();
  const selected = selectTenantForQuestionnaireLead([
    { id: 'tenant-b', status: 'active', created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'tenant-a', status: 'active', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'tenant-c', status: 'pending', created_at: '2026-01-01T00:00:00.000Z' },
  ]);

  assert.deepEqual(selected, { tenantId: null, routingReason: 'platform_unassigned' });
});

test('lead routing falls back to platform unassigned without active tenants', async () => {
  const { selectTenantForQuestionnaireLead } = await loadLeads();
  const selected = selectTenantForQuestionnaireLead([
    { id: 'tenant-c', status: 'suspended', created_at: '2026-01-01T00:00:00.000Z' },
  ]);

  assert.deepEqual(selected, { tenantId: null, routingReason: 'platform_unassigned' });
});

test('createLeadFromQuestionnaire inserts normalized payload and soft-fails acknowledgements', async () => {
  const { createLeadFromQuestionnaire } = await loadLeads();
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'lead-1', stage: payload.stage, tenant_id: payload.tenant_id },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };

  const result = await createLeadFromQuestionnaire(input, {
    supabase: supabase as never,
    enqueueEmail: async () => {
      throw new Error('email provider down');
    },
    enqueueWhatsApp: async () => ({ ok: false, reason: 'WHATSAPP_NOT_CONFIGURED' }),
  });

  assert.equal(result.leadId, 'lead-1');
  assert.equal(result.stage, 'new');
  assert.equal(result.assignedTenantId, null);
  assert.equal(inserts[0].table, 'leads');
  assert.equal(inserts[0].payload.source, 'questionnaire');
  assert.equal(inserts[0].payload.stage, 'new');
  assert.equal(inserts[0].payload.name, 'Aisha Khan');
  assert.equal(inserts[0].payload.routing_reason, 'platform_unassigned');
  assert.deepEqual(inserts[0].payload.estimate_data, { reference: 'EST-1234567890' });
});
