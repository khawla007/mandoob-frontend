import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('customer bank evidence control is narrow, replay-stable, and does not offer retention inputs', () => {
  const source = readFileSync(new URL('./BankEvidenceUpload.tsx', import.meta.url), 'utf8');
  const contract = readFileSync(
    new URL('../../lib/finance/bank-evidence-contract.ts', import.meta.url),
    'utf8',
  );
  assert.match(contract, /application\/pdf,image\/jpeg,image\/png/u);
  assert.match(source, /operationId\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(source, /credentials: 'same-origin'/u);
  assert.match(source, /x-mandoob-csrf/u);
  assert.match(source, /MAX_BANK_EVIDENCE_BYTES/u);
  assert.match(source, /@\/lib\/finance\/bank-evidence-contract/u);
  assert.doesNotMatch(source, /p3-07-bank-evidence-adapter/u);
  assert.doesNotMatch(source, /name=["'](?:policy_key|expires_at)["']/u);
});

test('customer invoice and reviewer pages expose the bank evidence workflow', () => {
  const customer = readFileSync(
    new URL(
      '../../app/(tenant)/t/[tenant]/(customer)/portal/payments/[invoiceId]/page.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const pro = readFileSync(
    new URL('../../app/(tenant)/t/[tenant]/(pro)/payments/[invoiceId]/page.tsx', import.meta.url),
    'utf8',
  );
  const admin = readFileSync(new URL('../../app/admin/finance/page.tsx', import.meta.url), 'utf8');
  assert.match(customer, /BankEvidenceUpload/u);
  assert.match(pro, /BankEvidenceReviewPanel/u);
  assert.match(admin, /BankEvidenceReviewPanel/u);
  const panel = readFileSync(
    new URL('../finance/BankEvidenceReviewPanel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(panel, /openAction/u);
  assert.match(panel, /window\.open/u);
  assert.match(panel, /lifetimeSeconds:\s*60/u);
  assert.match(panel, /useRouter/u);
  assert.match(panel, /router\.refresh\(\)/u);
  assert.match(panel, /rejectReason/u);
  assert.match(panel, /labels\.confirmReject/u);
  assert.doesNotMatch(panel, /Rejected by reviewer/u);
  assert.match(panel, /window\.open\(['"]about:blank['"]/u);
  assert.match(panel, /popup\.opener = null/u);
  assert.match(panel, /popup\?\.close\(\)/u);
  assert.match(panel, /location\.replace\(result\.data\.url\)/u);
  assert.match(
    panel,
    /try\s*\{[\s\S]*await openAction[\s\S]*catch\s*\{[\s\S]*popup\?\.close\(\)[\s\S]*setFailure\(labels\.actionFailed\)/u,
  );
  assert.doesNotMatch(panel, /console\.|localStorage|sessionStorage/u);

  const proActions = readFileSync(
    new URL('../../app/(tenant)/t/[tenant]/(pro)/payments/actions.ts', import.meta.url),
    'utf8',
  );
  const adminActions = readFileSync(
    new URL('../../app/admin/finance/actions.ts', import.meta.url),
    'utf8',
  );
  for (const actions of [proActions, adminActions]) {
    assert.match(actions, /openBankEvidence/u);
    assert.match(actions, /lifetimeSeconds:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(300\)/u);
    assert.match(actions, /submissionId:\s*z\.string\(\)\.uuid\(\)/u);
    assert.doesNotMatch(actions, /signed_url|console\.log/u);
  }

  const invoiceActions = readFileSync(
    new URL('../pro/InvoiceActions.tsx', import.meta.url),
    'utf8',
  );
  assert.match(invoiceActions, /bankAllocationOperationId/u);
  assert.match(invoiceActions, /bankAllocationOperationId\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(invoiceActions, /bankAllocationOperationId\.current = null/u);
});
