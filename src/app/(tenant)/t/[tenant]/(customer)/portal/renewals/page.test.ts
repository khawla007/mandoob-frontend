import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const root = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/renewals');
const page = readFileSync(join(root, 'page.tsx'), 'utf8');
const loader = readFileSync(
  join(process.cwd(), 'src/lib/data/customer-renewal-workspace.ts'),
  'utf8',
);

test('Customer renewal page directly authorizes linked Company and does not reuse PRO service loaders or mutations', () => {
  assert.match(page, /authorizeCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(page, /listCustomerRenewals/u);
  assert.doesNotMatch(
    page,
    /listProRenewalWorkspace|listRenewalsForCompany|NewRenewalDialog|RenewalRowActions/u,
  );
  assert.match(loader, /authorizeCustomerLinkedCompanyRead/u);
});

test('Customer renewal presentation exposes authoritative summaries and unavailable phase-three capabilities', () => {
  for (const key of ['overdue', 'dueSoon', 'upcoming', 'completed'])
    assert.match(page, new RegExp(key));
  for (const key of [
    'costUnavailable',
    'remindersUnavailable',
    'deliveryUnavailable',
    'mutationsUnavailable',
  ])
    assert.match(page, new RegExp(key));
  assert.doesNotMatch(page, /fee|auto-renew|reminder sent/iu);
});

test('Customer renewal rows distinguish Company and employee entities with unavailable label truth', () => {
  assert.match(page, /entityKind/u);
  assert.match(page, /entityLabel/u);
  assert.match(page, /entityLabelState/u);
  assert.match(page, /entityUnavailable/u);
});

test('partial-state presentation names exact totals, summary counts, and employee-label failures separately', () => {
  assert.match(page, /partialReasons/u);
  assert.match(page, /partialTotalDescription/u);
  assert.match(page, /partialSummariesDescription/u);
  assert.match(page, /partialEmployeeLabelsDescription/u);
  assert.match(en.customer.renewalWorkspace.partialEmployeeLabelsDescription, /employee label/iu);
});

test('Customer renewal route includes loading, empty, no-results, missing-date, error, partial, unlinked, and permission truth', () => {
  for (const key of [
    'empty',
    'noResults',
    'missingDate',
    'error',
    'partial',
    'unlinked',
    'permission',
  ])
    assert.match(page, new RegExp(key));
  assert.match(readFileSync(join(root, 'loading.tsx'), 'utf8'), /RenewalWorkspaceLoading/u);
  assert.match(readFileSync(join(root, 'error.tsx'), 'utf8'), /RenewalWorkspaceError/u);
});

test('Customer renewal messages preserve English/Arabic parity', () => {
  assert.deepEqual(
    Object.keys(en.customer.renewalWorkspace).sort(),
    Object.keys(ar.customer.renewalWorkspace).sort(),
  );
});
