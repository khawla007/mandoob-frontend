import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contracts = readFileSync(new URL('./contracts.ts', import.meta.url), 'utf8');

test('shared operations never implements a generic task mutation', () => {
  assert.doesNotMatch(contracts, /completeTask|createTask|assignTask|commentTask/u);
});

test('shared operations preserves domain-specific statuses', () => {
  assert.match(contracts, /domain: 'document'/u);
  assert.match(contracts, /domain: 'renewal'/u);
  assert.match(contracts, /domain: 'invoice'/u);
  assert.match(contracts, /domain: 'meeting'/u);
  assert.doesNotMatch(contracts, /type OperationalStatus =\s*'open'/u);
  assert.match(contracts, /type OperationalDocumentDisplay/u);
  assert.match(contracts, /type OperationalRenewalDisplay/u);
  assert.match(contracts, /type OperationalInvoiceDisplay/u);
  assert.match(contracts, /type OperationalCommunicationDisplay/u);
  assert.match(contracts, /type OperationalNotificationDisplay/u);
  assert.match(contracts, /type OperationalMeetingDisplayContract/u);
  assert.match(contracts, /deliveryStatus/u);
  assert.match(contracts, /readStatus/u);
});

test('presentation contracts cannot import audit, outbox, provider, or database sources', () => {
  assert.doesNotMatch(contracts, /audit-log|outbox|supabase|provider/u);
});
