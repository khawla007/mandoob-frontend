process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWhatsAppTemplate } from './index';

test('renewal-reminder: produces body + URL button components', () => {
  const out = renderWhatsAppTemplate('renewal-reminder', {
    customerName: 'Yusuf',
    tenantName: 'Acme PRO',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-10',
    daysOut: 7,
    detailPath: '/portal/renewals/abc-123',
  });
  assert.equal(out.metaTemplateName, 'renewal_reminder');
  assert.equal(out.language, 'en');
  assert.equal(out.components.length, 2);
  assert.equal(out.components[0].type, 'body');
  if (out.components[0].type === 'body') {
    assert.equal(out.components[0].parameters.length, 5);
    assert.equal(out.components[0].parameters[0].text, 'Yusuf');
  }
  assert.equal(out.components[1].type, 'button');
});

test('renewal-reminder: rejects unknown daysOut value', () => {
  assert.throws(() =>
    renderWhatsAppTemplate('renewal-reminder', {
      customerName: 'X',
      tenantName: 'Y',
      renewalLabel: 'Z',
      dueDate: '2026-06-10',
      // @ts-expect-error — invalid literal
      daysOut: 2,
      detailPath: '/x',
    }),
  );
});

test('renewal-reminder: accepts 14-day PRD window', () => {
  const out = renderWhatsAppTemplate('renewal-reminder', {
    customerName: 'Yusuf',
    tenantName: 'Acme PRO',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-10',
    daysOut: 14,
    detailPath: '/portal/renewals/abc-123',
  });
  if (out.components[0].type === 'body') {
    assert.equal(out.components[0].parameters[4].text, 'in 14 days');
  }
});

test('document-requested: handles null dueDate gracefully', () => {
  const out = renderWhatsAppTemplate('document-requested', {
    customerName: 'Layla',
    tenantName: 'Acme',
    documentLabel: 'Passport',
    uploadPath: '/portal/documents/req-1',
    dueDate: null,
  });
  assert.equal(out.metaTemplateName, 'document_requested');
  if (out.components[0].type === 'body') {
    assert.equal(out.components[0].parameters[3].text, 'as soon as possible');
  }
});

test('otp-code: rejects too-short code', () => {
  assert.throws(() => renderWhatsAppTemplate('otp-code', { code: '12' }));
});

test('otp-code: accepts 6-digit code', () => {
  const out = renderWhatsAppTemplate('otp-code', { code: '123456' });
  assert.equal(out.metaTemplateName, 'otp_code');
  if (out.components[0].type === 'body') {
    assert.equal(out.components[0].parameters[0].text, '123456');
  }
});

test('lead-acknowledgement: produces compact body parameters', () => {
  const out = renderWhatsAppTemplate('lead-acknowledgement', {
    leadName: 'Aisha',
    tenantName: 'Acme PRO',
    leadReference: 'lead-1',
  });

  assert.equal(out.metaTemplateName, 'lead_acknowledgement');
  assert.equal(out.language, 'en');
  assert.equal(out.components.length, 1);
  if (out.components[0].type === 'body') {
    assert.deepEqual(
      out.components[0].parameters.map((parameter) => parameter.text),
      ['Aisha', 'Acme PRO', 'lead-1'],
    );
  }
});
