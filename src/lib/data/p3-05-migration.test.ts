import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260922050000_0106_p3_05_public_intake.sql',
);

test('P3.05 migration owns versioned definitions, opaque drafts, receipts, and attachment bindings', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const token of [
    'questionnaire_definitions',
    'questionnaire_definition_versions',
    'public_application_drafts',
    'resume_secret_hash',
    'public_intake_operations',
    'public_application_attachments',
    'lead_score_version',
    'row_version',
  ]) {
    assert.match(sql, new RegExp(token));
  }
  assert.doesNotMatch(sql, /resume_secret\s+text/i);
});

test('P3.05 mutations are atomic, replay-safe, version-aware, and event-backed', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const token of [
    'accept_public_contact',
    'create_public_application_draft',
    'save_public_application_draft',
    'submit_public_application',
    'mutate_platform_lead',
    'expected_version',
    'request_hash',
    'publish_domain_event',
    'application.draft_submitted',
    'lead.stage_changed',
  ]) {
    assert.match(sql, new RegExp(token.replaceAll('.', '\\.'), 'i'));
  }
});

test('anonymous callers cannot read private intake tables directly', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /revoke all on .*public_application_drafts.* from anon/i);
  assert.match(sql, /grant execute on function .*create_public_application_draft.* to anon/i);
});
