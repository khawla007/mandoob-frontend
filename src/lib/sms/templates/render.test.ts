import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSmsTemplate } from './index';

test('renewal-reminder: contains label, due date, headline, url', () => {
  const out = renderSmsTemplate('renewal-reminder', {
    customerName: 'Yusuf',
    tenantName: 'Acme PRO',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-10',
    daysOut: 7,
    detailUrl: 'https://app.example.com/r/1',
  });
  assert.match(out.body, /Trade License/);
  assert.match(out.body, /2026-06-10/);
  assert.match(out.body, /in 7 days/);
  assert.match(out.body, /https:\/\/app\.example\.com\/r\/1/);
});

test('renewal-reminder: rejects unknown daysOut', () => {
  assert.throws(() =>
    renderSmsTemplate('renewal-reminder', {
      customerName: 'X',
      tenantName: 'Y',
      renewalLabel: 'Z',
      dueDate: '2026-06-10',
      // @ts-expect-error invalid literal
      daysOut: 2,
      detailUrl: '/x',
    }),
  );
});

test('renewal-reminder: accepts 14-day PRD window', () => {
  const out = renderSmsTemplate('renewal-reminder', {
    customerName: 'Yusuf',
    tenantName: 'Acme PRO',
    renewalLabel: 'Trade License',
    dueDate: '2026-06-10',
    daysOut: 14,
    detailUrl: 'https://app.example.com/r/1',
  });
  assert.match(out.body, /in 14 days/);
});

test('document-requested: handles null due date', () => {
  const out = renderSmsTemplate('document-requested', {
    customerName: 'Layla',
    tenantName: 'Acme',
    documentLabel: 'Passport',
    uploadUrl: 'https://app.example.com/u/1',
    dueDate: null,
  });
  assert.match(out.body, /Passport/);
  assert.match(out.body, /as soon as possible/);
});

test('otp-code: contains code', () => {
  const out = renderSmsTemplate('otp-code', { code: '123456' });
  assert.match(out.body, /123456/);
  assert.equal(out.multiSegment, false);
});

test('otp-code: rejects too-short code', () => {
  assert.throws(() => renderSmsTemplate('otp-code', { code: '12' }));
});

test('otp-code: rejects too-long code', () => {
  assert.throws(() => renderSmsTemplate('otp-code', { code: '12345678901' }));
});
