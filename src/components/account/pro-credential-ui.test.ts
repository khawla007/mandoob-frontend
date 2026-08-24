import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

test('PRO credential panel is masked-only and exposes the complete legal self-service state model', () => {
  const panel = read('src/components/account/ProCredentialPanel.tsx');
  assert.match(panel, /maskedIdentifier/u);
  assert.match(panel, /dir="ltr"/u);
  assert.match(panel, /credential\.issueDate/u);
  assert.match(panel, /credential\.expiryDate/u);
  assert.match(panel, /draft/u);
  assert.match(panel, /submitted/u);
  assert.match(panel, /under_review/u);
  assert.match(panel, /verified/u);
  assert.match(panel, /rejected/u);
  assert.match(panel, /expired/u);
  assert.match(panel, /revoked/u);
  assert.match(panel, /ProCredentialForm/u);
  assert.match(panel, /ProCredentialEvidenceForm/u);
  assert.match(panel, /replacement/u);
  assert.match(panel, /reason/u);
  assert.doesNotMatch(panel, /identifierCiphertext|identifierHash|storagePath|sha256/u);
  assert.doesNotMatch(panel, /assignment|companySwitcher|company switcher/iu);
});

test('credential editor keeps protected identifier blank and implements accessible RHF/Zod behavior', () => {
  const form = read('src/components/account/ProCredentialForm.tsx');
  assert.match(form, /useForm/u);
  assert.match(form, /zodResolver/u);
  assert.match(form, /identifier:\s*''/u);
  assert.doesNotMatch(form, /maskedIdentifier[^\n]*defaultValue/u);
  assert.match(form, /<Label/u);
  assert.match(form, /aria-describedby/u);
  assert.match(form, /role="alert"/u);
  assert.match(form, /errorSummaryRef/u);
  assert.match(form, /setFocus/u);
  assert.match(form, /claimFormSubmission/u);
  assert.match(form, /useUnsavedChangesGuard/u);
  assert.match(form, /aria-live="polite"/u);
  assert.match(form, /router\.refresh/u);
  assert.doesNotMatch(form, />\s*(Save|Submit|Replace|Identifier|Issuing authority)\s*</u);
});

test('evidence form advertises accepted formats while leaving authoritative checks to the server route', () => {
  const form = read('src/components/account/ProCredentialEvidenceForm.tsx');
  assert.match(form, /useForm/u);
  assert.match(form, /zodResolver/u);
  assert.match(form, /accept="application\/pdf,image\/jpeg,image\/png"/u);
  assert.match(form, /10/u);
  assert.match(form, /FormData/u);
  assert.match(form, /\/api\/v1\/account\/pro\/credentials\/evidence/u);
  assert.match(form, /evidence\/\$\{evidence\.evidenceId\}/u);
  assert.match(form, /method:\s*'DELETE'/u);
  assert.match(form, /claimFormSubmission/u);
  assert.match(form, /useUnsavedChangesGuard/u);
  assert.match(form, /aria-live="polite"/u);
  assert.match(form, /<Label/u);
  assert.match(form, /originalNameSafe/u);
  assert.match(form, /formatProEvidenceRemovalConfirmation/u);
  assert.match(form, /variant="destructive"/u);
  assert.match(form, /errorSummaryRef/u);
  assert.match(form, /credential-evidence-error-summary/u);
  assert.match(form, /formatProEvidenceCreatedDate/u);
  assert.match(form, /formatProEvidenceMime/u);
  assert.doesNotMatch(form, /storagePath|sha256|scanProvider/u);
});

test('credential UI messages have English/Arabic parity and Arabic dates remain LTR', () => {
  const en = JSON.parse(read('src/messages/en.json')) as { account: { proCredential: unknown } };
  const ar = JSON.parse(read('src/messages/ar.json')) as { account: { proCredential: unknown } };
  assert.ok(en.account.proCredential);
  assert.deepEqual(
    Object.keys(en.account.proCredential as object).sort(),
    Object.keys(ar.account.proCredential as object).sort(),
  );
  assert.match(read('src/components/account/ProCredentialPanel.tsx'), /dir="ltr"/u);
});

test('save success copy distinguishes the cleared input from the retained protected value', () => {
  const en = JSON.parse(read('src/messages/en.json')) as {
    account: { proCredential: { saved: string } };
  };
  const ar = JSON.parse(read('src/messages/ar.json')) as {
    account: { proCredential: { saved: string } };
  };
  assert.match(en.account.proCredential.saved, /input is now blank/u);
  assert.match(en.account.proCredential.saved, /saved identifier remains protected/u);
  assert.doesNotMatch(en.account.proCredential.saved, /identifier has been cleared/u);
  assert.match(ar.account.proCredential.saved, /حقل.*فارغ/u);
  assert.match(ar.account.proCredential.saved, /المعرّف المحفوظ.*محمي/u);
});

test('self-service credential partial source remains recoverable and all mutations sanitize conflicts', () => {
  const panel = read('src/components/account/ProCredentialPanel.tsx');
  const form = read('src/components/account/ProCredentialForm.tsx');
  const evidence = read('src/components/account/ProCredentialEvidenceForm.tsx');
  assert.match(panel, /partialSource/u);
  assert.match(panel, /retryHref/u);
  assert.match(panel, /RotateCcw/u);
  assert.match(panel, /min-h-11/u);
  assert.match(form, /CREDENTIAL_IN_PROGRESS/u);
  assert.match(form, /INVALID_CREDENTIAL_TRANSITION/u);
  assert.match(evidence, /EVIDENCE_REMOVAL_IN_PROGRESS/u);
  for (const source of [form, evidence]) {
    assert.doesNotMatch(source, /setError\([^)]*(?:message|stack)/u);
    assert.match(source, /aria-live="polite"/u);
  }
});
