process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type SendModule = typeof import('./send');
let mod: SendModule | null = null;
async function load(): Promise<SendModule> {
  if (!mod) mod = await import('./send');
  return mod;
}

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function readFetchBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const raw =
    typeof init?.body === 'string'
      ? init.body
      : input instanceof Request
        ? await input.clone().text()
        : '';
  return raw ? JSON.parse(raw) : null;
}

function approvalRow(templateId: string, status: 'pending' | 'approved' | 'rejected' | 'disabled') {
  return {
    id: `approval-${templateId}`,
    tenant_id: 'tenant-1',
    template_id: templateId,
    meta_template_name:
      templateId === 'opt-out-confirmation'
        ? 'mandoob_opt_out_confirmation'
        : 'renewal_reminder',
    language: 'en',
    category: 'utility',
    status,
    notes: null,
    rejection_reason: null,
    submitted_at: null,
    last_checked_at: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-05-21T00:00:00.000Z',
    updated_at: '2026-05-21T00:00:00.000Z',
  };
}

test('whatsapp nextScheduledFor: attempt 1 → 2 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(1, now).getTime();
  assert.equal((t - now) / 60_000, 2);
});

test('whatsapp nextScheduledFor: attempt 4 → 16 min', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(4, now).getTime();
  assert.equal((t - now) / 60_000, 16);
});

test('whatsapp nextScheduledFor: attempt 6 → capped at 60', async () => {
  const { nextScheduledFor } = await load();
  const now = 1_000_000_000_000;
  const t = nextScheduledFor(6, now).getTime();
  assert.equal((t - now) / 60_000, 60);
});

test('whatsapp MAX_ATTEMPTS shared with email — 5', async () => {
  const { MAX_ATTEMPTS } = await load();
  assert.equal(MAX_ATTEMPTS, 5);
});

test('enqueueWhatsApp skips opted-out recipients and writes audit without queue insert', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/rest/v1/consent_opt_outs')) {
      return Response.json({ id: 'opt-1' }, { status: 200 });
    }
    if (url.includes('/rest/v1/tenant_audit_log')) {
      return Response.json([], { status: 201 });
    }
    return Response.json([], { status: 200 });
  }) as typeof fetch;

  const { enqueueWhatsApp } = await load();
  const result = await enqueueWhatsApp({
    tenantId: 'tenant-1',
    templateId: 'renewal-reminder',
    toPhone: '+971500000001',
    input: {
      customerName: 'Aisha',
      tenantName: 'Mandoob',
      renewalLabel: 'Trade license',
      dueDate: '2026-06-01',
      daysOut: 30,
      detailPath: '/portal/renewals',
    },
    scheduledFor: new Date('2099-01-01T00:00:00.000Z'),
  });

  assert.deepEqual(result, { ok: false, reason: 'RECIPIENT_OPTED_OUT' });
  assert.equal(urls.some((url) => url.includes('/rest/v1/outbound_whatsapp')), false);
  assert.equal(urls.filter((url) => url.includes('/rest/v1/tenant_audit_log')).length, 1);
});

test('enqueueWhatsApp queues approved WhatsApp templates', async () => {
  const { encrypt } = await import('@/lib/crypto/pii');
  const urls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/rest/v1/consent_opt_outs')) {
      return Response.json(null, { status: 200 });
    }
    if (url.includes('/rest/v1/whatsapp_template_approvals')) {
      return Response.json(approvalRow('renewal-reminder', 'approved'), { status: 200 });
    }
    if (url.includes('/rest/v1/tenant_whatsapp_config')) {
      return Response.json(
        {
          tenant_id: 'tenant-1',
          business_account_id: 'waba-1',
          phone_number_id: 'phone-1',
          access_token_encrypted: encrypt('wa-token'),
          enabled: true,
        },
        { status: 200 },
      );
    }
    if (url.includes('/rest/v1/outbound_whatsapp')) {
      const body = await readFetchBody(input, init);
      assert.equal((body as { template_id: string }).template_id, 'renewal-reminder');
      return Response.json({ id: 123 }, { status: 201 });
    }
    return Response.json([], { status: 200 });
  }) as typeof fetch;

  const { enqueueWhatsApp } = await load();
  const result = await enqueueWhatsApp({
    tenantId: 'tenant-1',
    templateId: 'renewal-reminder',
    toPhone: '+971500000001',
    input: {
      customerName: 'Aisha',
      tenantName: 'Mandoob',
      renewalLabel: 'Trade license',
      dueDate: '2026-06-01',
      daysOut: 30,
      detailPath: '/portal/renewals',
    },
    scheduledFor: new Date('2099-01-01T00:00:00.000Z'),
  });

  assert.deepEqual(result, { ok: true, queueId: 123, status: 'pending' });
  assert.equal(urls.some((url) => url.includes('/rest/v1/tenant_whatsapp_config')), true);
  assert.equal(urls.filter((url) => url.includes('/rest/v1/outbound_whatsapp')).length, 1);
});

test('enqueueWhatsApp blocks unapproved templates and writes audit without queue insert', async () => {
  for (const status of ['pending', 'rejected', 'missing'] as const) {
    const urls: string[] = [];
    const auditPayloads: unknown[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/rest/v1/consent_opt_outs')) {
        return Response.json(null, { status: 200 });
      }
      if (url.includes('/rest/v1/whatsapp_template_approvals')) {
        return Response.json(
          status === 'missing' ? null : approvalRow('renewal-reminder', status),
          { status: 200 },
        );
      }
      if (url.includes('/rest/v1/tenant_audit_log')) {
        auditPayloads.push(await readFetchBody(input, init));
        return Response.json([], { status: 201 });
      }
      return Response.json([], { status: 200 });
    }) as typeof fetch;

    const { enqueueWhatsApp } = await load();
    const result = await enqueueWhatsApp({
      tenantId: 'tenant-1',
      templateId: 'renewal-reminder',
      toPhone: '+971500000001',
      input: {
        customerName: 'Aisha',
        tenantName: 'Mandoob',
        renewalLabel: 'Trade license',
        dueDate: '2026-06-01',
        daysOut: 30,
        detailPath: '/portal/renewals',
      },
      scheduledFor: new Date('2099-01-01T00:00:00.000Z'),
    });

    assert.deepEqual(result, { ok: false, reason: 'WHATSAPP_TEMPLATE_NOT_APPROVED' });
    assert.equal(urls.some((url) => url.includes('/rest/v1/outbound_whatsapp')), false);
    assert.equal(urls.some((url) => url.includes('/rest/v1/tenant_whatsapp_config')), false);
    assert.equal(auditPayloads.length, 1);
    assert.deepEqual(auditPayloads[0], {
      tenant_id: 'tenant-1',
      actor_id: null,
      action: 'whatsapp_template_status_updated',
      source: 'system',
      details: {
        template_id: 'renewal-reminder',
        approval_status: status,
        skip_reason: 'WHATSAPP_TEMPLATE_NOT_APPROVED',
      },
    });
  }
});

test('enqueueWhatsApp approval-guards opt-out confirmation even though it bypasses consent', async () => {
  const urls: string[] = [];
  const auditPayloads: unknown[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/rest/v1/whatsapp_template_approvals')) {
      return Response.json(null, { status: 200 });
    }
    if (url.includes('/rest/v1/tenant_audit_log')) {
      auditPayloads.push(await readFetchBody(input, init));
      return Response.json([], { status: 201 });
    }
    return Response.json([], { status: 200 });
  }) as typeof fetch;

  const { enqueueWhatsApp } = await load();
  const result = await enqueueWhatsApp({
    tenantId: 'tenant-1',
    templateId: 'opt-out-confirmation',
    toPhone: '+971500000001',
    input: {},
    scheduledFor: new Date('2099-01-01T00:00:00.000Z'),
  });

  assert.deepEqual(result, { ok: false, reason: 'WHATSAPP_TEMPLATE_NOT_APPROVED' });
  assert.equal(urls.some((url) => url.includes('/rest/v1/consent_opt_outs')), false);
  assert.equal(urls.some((url) => url.includes('/rest/v1/outbound_whatsapp')), false);
  assert.equal(auditPayloads.length, 1);
  assert.deepEqual(auditPayloads[0], {
    tenant_id: 'tenant-1',
    actor_id: null,
    action: 'whatsapp_template_status_updated',
    source: 'system',
    details: {
      template_id: 'opt-out-confirmation',
      approval_status: 'missing',
      skip_reason: 'WHATSAPP_TEMPLATE_NOT_APPROVED',
    },
  });
});
