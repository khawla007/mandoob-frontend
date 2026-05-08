// Set env before any import that touches @/lib/env
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

type RegistryModule = typeof import('./index');
let mod: RegistryModule | null = null;
async function load(): Promise<RegistryModule> {
  if (!mod) mod = await import('./index');
  return mod;
}

test('tenant-pending-received: subject + body interpolate', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('tenant-pending-received', {
    adminName: 'Sara',
    tenantName: 'Acme PRO',
  });
  assert.ok(r.subject.includes('Acme PRO'));
  assert.ok(r.html.includes('Sara'));
  assert.ok(!r.html.includes('{{'));
});

test('tenant-approved: includes inviteUrl', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('tenant-approved', {
    adminName: 'Sara',
    tenantName: 'Acme',
    inviteUrl: 'https://app.example.com/invite/xyz',
  });
  assert.ok(r.html.includes('https://app.example.com/invite/xyz'));
});

test('tenant-rejected: reason rendered when present', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('tenant-rejected', {
    adminName: 'Sara',
    tenantName: 'Acme',
    reason: 'Trade license expired',
  });
  assert.ok(r.html.includes('Trade license expired'));
});

test('tenant-rejected: no reason block when null', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('tenant-rejected', {
    adminName: 'Sara',
    tenantName: 'Acme',
    reason: null,
  });
  assert.ok(!r.html.includes('Reviewer note'));
});

test('document-requested: includes upload link + label', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('document-requested', {
    customerName: 'Omar',
    tenantName: 'Acme',
    documentLabel: 'Passport',
    uploadUrl: 'https://app.example.com/u/1',
    dueDate: '2026-06-01',
  });
  assert.ok(r.html.includes('Passport'));
  assert.ok(r.html.includes('https://app.example.com/u/1'));
  assert.ok(r.html.includes('2026-06-01'));
});

test('document-approved: subject includes label', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('document-approved', {
    customerName: 'Omar',
    tenantName: 'Acme',
    documentLabel: 'Trade License',
  });
  assert.ok(r.subject.includes('Trade License'));
});

test('renewal-reminder: 30-day variant', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('renewal-reminder', {
    customerName: 'Omar',
    tenantName: 'Acme',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-05',
    daysOut: 30,
    detailUrl: 'https://app.example.com/r/1',
  });
  assert.ok(r.subject.includes('30 days'));
  assert.ok(r.html.includes('Trade License'));
});

test('renewal-reminder: 1-day variant says final or tomorrow', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('renewal-reminder', {
    customerName: 'Omar',
    tenantName: 'Acme',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-05',
    daysOut: 1,
    detailUrl: 'https://app.example.com/r/1',
  });
  const s = r.subject.toLowerCase();
  assert.ok(s.includes('final') || s.includes('tomorrow'));
});

test('renewal-reminder: 14-day variant', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('renewal-reminder', {
    customerName: 'Omar',
    tenantName: 'Acme',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-05',
    daysOut: 14,
    detailUrl: 'https://app.example.com/r/1',
  });
  assert.ok(r.subject.includes('14 days'));
});

test('invoice-due: amount in subject', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('invoice-due', {
    customerName: 'Omar',
    tenantName: 'Acme',
    amount: 'AED 500',
    invoiceUrl: 'https://app.example.com/i/1',
  });
  assert.ok(r.subject.includes('AED 500'));
});

test('generic-invite: includes role + url', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('generic-invite', {
    toName: 'Layla',
    tenantName: 'Acme',
    role: 'pro',
    inviteUrl: 'https://app.example.com/i/abc',
  });
  assert.ok(r.html.includes('pro'));
  assert.ok(r.html.includes('https://app.example.com/i/abc'));
});

test('otp-code: code appears in subject + body', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('otp-code', { code: '123456' });
  assert.ok(r.subject.includes('123456'));
  assert.ok(r.html.includes('123456'));
});

test('lead-acknowledgement: includes lead reference and next step context', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('lead-acknowledgement', {
    leadName: 'Aisha',
    tenantName: 'Mandoob',
    leadReference: 'lead-1',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
  });

  assert.ok(r.subject.includes('lead-1'));
  assert.ok(r.html.includes('Aisha'));
  assert.ok(r.html.includes('DMCC'));
  assert.ok(!r.html.includes('{{'));
});

test('lead-acknowledgement: escapes public HTML values', async () => {
  const { renderTemplate } = await load();
  const r = renderTemplate('lead-acknowledgement', {
    leadName: '<script>alert(1)</script>',
    tenantName: 'Mandoob',
    leadReference: 'lead-1',
    jurisdiction: 'free_zone',
    authority: '<a href="https://evil.test">DMCC</a>',
  });

  assert.ok(!r.html.includes('<script>'));
  assert.ok(!r.html.includes('<a href='));
  assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(r.html.includes('&lt;a href=&quot;https://evil.test&quot;&gt;DMCC&lt;/a&gt;'));
});
