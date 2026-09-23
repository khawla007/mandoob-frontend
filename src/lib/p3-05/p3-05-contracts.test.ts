import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key-with-enough-length';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-with-enough-length';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'mandoob.test';
process.env.ENCRYPTION_KEY = 'encryption-key-with-enough-length-32chars';

const root = process.cwd();
const sql = readFileSync(
  join(root, 'supabase/migrations/20260922050000_0106_p3_05_public_intake.sql'),
  'utf8',
);

test('migration defines every P3.05 durable-mutation RPC', () => {
  for (const fn of [
    'accept_public_contact',
    'create_public_application_draft',
    'save_public_application_draft',
    'submit_public_application',
    'mutate_platform_lead',
    'reserve_public_application_attachment',
    'finalize_public_application_attachment',
    'delete_public_application_attachment',
    'save_questionnaire_draft',
    'publish_questionnaire_version',
    'archive_questionnaire_version',
  ]) {
    assert.ok(sql.includes(`create function public.${fn}(`), `missing RPC ${fn}`);
  }
});

test('public intake RPCs are anon-callable while admin RPCs are not', () => {
  for (const fn of [
    'accept_public_contact',
    'create_public_application_draft',
    'save_public_application_draft',
    'submit_public_application',
    'reserve_public_application_attachment',
  ]) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon`));
  }
  // Admin lead + questionnaire mutations must never be granted to anon.
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.mutate_platform_lead\([^)]*\) to [^;]*anon/,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.save_questionnaire_draft\([^)]*\) to [^;]*anon/,
  );
});

test('drafts authorize by hashed resume credential and enforce replay receipts', () => {
  assert.match(
    sql,
    /resume_secret_hash text not null check \(resume_secret_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/,
  );
  assert.match(sql, /v_draft\.resume_secret_hash <> p_resume_secret_hash/);
  assert.ok(sql.includes('public_intake_operations'));
  assert.ok(sql.includes('OPERATION_REUSED'));
  assert.ok(sql.includes('private.p305_replay'));
});

test('row-level security is enabled and published questionnaire versions are the only public read', () => {
  for (const table of [
    'public_application_drafts',
    'public_applications',
    'public_application_attachments',
    'public_contact_intakes',
    'public_intake_operations',
    'questionnaire_definitions',
    'questionnaire_definition_versions',
  ]) {
    assert.ok(sql.includes(`alter table public.${table} enable row level security`), table);
  }
  assert.ok(sql.includes('questionnaire_published_public_read'));
  assert.ok(sql.includes('questionnaire_one_published_version_idx'));
});

test('questionnaire publishing keeps a single published version and requires a draft source', () => {
  assert.ok(sql.includes('VERSION_NOT_PUBLISHABLE'));
  assert.match(
    sql,
    /set state = 'archived'[\s\S]*where definition_id = p_definition_id and state = 'published'/,
  );
  assert.ok(sql.includes('private.p305_require_admin_aal2'));
  assert.ok(sql.includes("coalesce(auth.jwt()->>'aal', '') <> 'aal2'"));
});

test('module contracts are exported for estimator, resume, scoring, definitions, and events', async () => {
  const estimator = await import('@/lib/estimator/authoritative-result');
  assert.equal(typeof estimator.calculateAuthoritativeEstimate, 'function');
  assert.equal(typeof estimator.verifyEstimateResultToken, 'function');

  const applications = await import('@/lib/public-intake/applications');
  assert.equal(typeof applications.hashResumeSecret, 'function');

  const scoring = await import('@/lib/leads/scoring');
  assert.equal(scoring.LEAD_SCORE_VERSION, 1);

  const questionnaire = await import('@/lib/questionnaire/versioned-definition');
  assert.equal(typeof questionnaire.validateQuestionnaireDefinition, 'function');

  const manifest = await import('@/lib/events/p3-05-manifest');
  assert.equal(manifest.P3_05_EVENT_TYPES.length, 6);
});

test('PRO leads route stays retired', () => {
  const page = readFileSync(join(root, 'src/app/(tenant)/t/[tenant]/(pro)/leads/page.tsx'), 'utf8');
  assert.ok(page.includes('notFound'));
  assert.doesNotMatch(page, /LeadKanbanBoard|listTenantLeadKanban/);
});
