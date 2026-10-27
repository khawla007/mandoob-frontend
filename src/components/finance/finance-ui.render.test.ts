import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('finance UI exposes the approved reusable component boundaries', () => {
  for (const file of [
    'InvoiceComposer.tsx',
    'AllocationForm.tsx',
    'BankEvidenceForm.tsx',
    'FinanceSummary.tsx',
    'PlanCatalogEditor.tsx',
    'SubscriptionControls.tsx',
  ]) {
    assert.equal(existsSync(join(root, 'src/components/finance', file)), true, file);
  }
});

test('customer payment action uses localized copy and sanitized error states', () => {
  const source = read('src/components/customer/PayButton.tsx');
  assert.match(source, /useTranslations\('customer\.financeWorkspace\.payAction'\)/u);
  assert.match(source, /t\('pay'\)/u);
  assert.match(source, /t\('redirecting'\)/u);
  assert.match(source, /t\('unavailable'\)/u);
  assert.doesNotMatch(source, /setError\(result\.error\)/u);
  assert.doesNotMatch(source, />Pay<|Redirecting…/u);
});

test('finance pages have a single h1 and labelled table overflow regions', () => {
  const billing = read('src/app/(tenant)/t/[tenant]/(pro)/settings/billing/page.tsx');
  const admin = read('src/app/admin/finance/page.tsx');
  const invoices = read('src/components/pro/InvoicesTable.tsx');

  assert.equal(billing.match(/<h1\b/gu)?.length, 1);
  assert.equal(billing.match(/<h2\b/gu)?.length ?? 0, 0);
  assert.match(admin, /timeZone: 'Asia\/Dubai'/u);
  assert.doesNotMatch(admin, /currencyUsd/u);
  assert.doesNotMatch(admin, /: row\.(?:plan|status)\}/u);
  assert.match(admin, /role="region"[\s\S]*tabIndex=\{0\}/u);
  assert.match(invoices, /role="region"[\s\S]*tabIndex=\{0\}/u);
  assert.doesNotMatch(invoices, /No invoices yet\./u);
});

test('Arabic finance copy does not retain known English placeholders', () => {
  const messages = JSON.parse(read('src/messages/ar.json')) as Record<string, unknown>;
  const serialized = JSON.stringify(messages);
  for (const phrase of [
    'New invoice',
    'Issue an AED invoice',
    'Could not create invoice',
    'Trade licence renewal',
    'Pending invoices and recent receipts.',
    'Your registration, documents, renewals, and invoices at a glance.',
  ]) {
    assert.equal(serialized.includes(phrase), false, phrase);
  }
});
