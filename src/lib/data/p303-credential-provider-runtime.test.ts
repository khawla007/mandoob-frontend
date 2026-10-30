import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimePath = 'supabase/tests/p303-combined-credential-provider-runtime.mjs';

test('combined credential provider runtime owns exact local fixtures and exercises real boundaries', () => {
  const source = readFileSync(runtimePath, 'utf8');

  assert.match(source, /supabase_db_mandoob-p303-combined-j3xcqw/u);
  assert.match(source, /mandoob-p303-combined-clamav-/u);
  assert.match(source, /createEvidencePostHandler/u);
  assert.match(source, /createEvidenceDeleteHandler/u);
  assert.match(source, /recoverAbandonedProCredentialEvidence/u);
  assert.match(source, /createEvidenceDownloadHandler/u);
  assert.match(source, /issueProCredentialDownloadToken/u);
  assert.match(source, /verifyProCredentialDownloadToken/u);
  assert.match(source, /coordinateDocumentUpload/u);
  assert.match(source, /signDocumentAccess/u);
  assert.match(source, /scanFilePrivate/u);
  assert.match(source, /validateCredentialDocumentUpload/u);
  assert.match(source, /AAL2_REQUIRED/u);
  assert.match(source, /NOT_FOUND/u);
  assert.match(source, /SCANNER_UNAVAILABLE/u);
  assert.match(source, /FILE_REJECTED_BY_SCAN/u);
  assert.match(source, /EVIDENCE_UPLOAD_RESERVATION_LOST/u);
  assert.match(source, /OPERATION_REUSED/u);
  assert.match(source, /tenant-documents/u);
  assert.match(source, /storage\.objects/u);
  assert.match(source, /document_access_audit/u);
  assert.match(source, /generalSentinel/u);
  assert.match(source, /completedReplayCorruption/u);
  assert.match(source, /providerUnavailableReplay/u);
  assert.match(source, /docker\(\['stop', expectedStorage\]\)/u);
  assert.match(source, /docker\(\['start', expectedStorage\]\)/u);
  assert.match(source, /triggerBaseline/u);
  assert.match(source, /restoreTriggerStatement/u);
  assert.match(source, /expireRemovalLease/u);
  assert.match(source, /cleanupStages/u);
  assert.match(source, /AggregateError/u);
  assert.match(source, /scanner removal/u);
  assert.match(source, /final residue and trigger assertions/u);
  assert.match(source, /has_function_privilege/u);
  assert.match(source, /find['"],\s*['"]\/mnt/u);
  assert.match(source, /sha256/u);
  assert.match(source, /scan_provider/u);
  assert.match(source, /finally/u);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:SERVICE_KEY|ANON_KEY|storagePath)/u);
});
