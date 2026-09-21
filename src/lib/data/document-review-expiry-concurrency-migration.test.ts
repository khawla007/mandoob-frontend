import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260916041200_0104_document_review_expiry_concurrency.sql',
);

const fixturePath = resolve(process.cwd(), 'supabase/tests/document_review_expiry_concurrency.sql');
const runnerPath = resolve(
  process.cwd(),
  'supabase/tests/run_document_review_expiry_concurrency.sh',
);
const sessionRunnerPath = resolve(
  process.cwd(),
  'supabase/tests/document_review_expiry_concurrency.mjs',
);
const setupPath = resolve(
  process.cwd(),
  'supabase/tests/document_review_expiry_concurrency_setup.sql',
);
const teardownPath = resolve(
  process.cwd(),
  'supabase/tests/document_review_expiry_concurrency_teardown.sql',
);

function compact(path: string): string {
  return readFileSync(path, 'utf8').replace(/--.*$/gmu, '').replace(/\s+/gu, ' ');
}

function functionBody(sql: string, functionName: string): string {
  const match = sql.match(
    new RegExp(
      `create function public\\.${functionName}\\([\\s\\S]+?as \\$function\\$([\\s\\S]+?)\\$function\\$;`,
      'iu',
    ),
  );

  assert.ok(match?.[1], `${functionName} body must be present`);
  return match[1];
}

test('0104 replaces review and expiry with owner-controlled optimistic transactions', () => {
  const sql = compact(migrationPath);

  assert.match(
    sql,
    /drop function public\.review_document_version\(uuid, uuid, uuid, text, text, timestamptz\)/iu,
  );
  assert.match(sql, /drop function public\.set_pro_document_expiry\(uuid, uuid, uuid, date\)/iu);
  assert.match(sql, /create function public\.review_document_version\(/iu);
  assert.match(
    sql,
    /p_company_id uuid[\s\S]*p_document_id uuid[\s\S]*p_version_id uuid[\s\S]*p_expected_head_version_id uuid[\s\S]*p_expected_review_status text/iu,
  );
  assert.match(sql, /security definer set search_path = ''/iu);
  assert.match(sql, /owner to postgres/iu);
  assert.match(sql, /lock_company_assignment_resources\(p_company_id, array\[p_actor_id\]\)/iu);
  assert.match(
    sql,
    /pro_company_assignments[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id[\s\S]*pro_profile_id = p_actor_id[\s\S]*status = 'active'[\s\S]*for share/iu,
  );
  assert.match(sql, /current_version_id is distinct from p_expected_head_version_id/iu);
  assert.match(sql, /review_status is distinct from p_expected_review_status/iu);
  assert.match(sql, /errcode = 'MD409', message = 'document_review_conflict'/iu);
  assert.match(sql, /reviewed_at = v_decided_at/iu);
  assert.doesNotMatch(sql, /p_reviewed_at/iu);
  assert.match(sql, /'expected_head_version_id', p_expected_head_version_id/iu);
  assert.match(sql, /'previous_review_status', p_expected_review_status/iu);

  assert.match(sql, /create function public\.set_pro_document_expiry\(/iu);
  assert.match(
    sql,
    /p_expected_head_version_id uuid[\s\S]*p_expected_expires_on date[\s\S]*p_expires_on date/iu,
  );
  assert.match(sql, /current_version_id is distinct from p_expected_head_version_id/iu);
  assert.match(sql, /expires_on is distinct from p_expected_expires_on/iu);
  assert.match(sql, /errcode = 'MD409', message = 'document_expiry_conflict'/iu);
  assert.match(sql, /expiry_externally_managed/iu);
  assert.match(sql, /'previous_expires_on', p_expected_expires_on/iu);
  assert.match(sql, /'expected_head_version_id', p_expected_head_version_id/iu);

  assert.match(
    sql,
    /revoke all on function public\.review_document_version\([^;]+ from public, anon, authenticated, service_role/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.review_document_version\([^;]+ to service_role/iu,
  );
  assert.match(
    sql,
    /revoke all on function public\.set_pro_document_expiry\([^;]+ from public, anon, authenticated, service_role/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.set_pro_document_expiry\([^;]+ to service_role/iu,
  );
  assert.match(
    sql,
    /revoke insert, update, delete, truncate, references, trigger on table public\.document_versions from public, anon, authenticated, service_role/iu,
  );
});

test('review/expiry rollback and held-session artifacts cover conflict atomicity', () => {
  const fixture = compact(fixturePath);
  const runner = compact(runnerPath);
  for (const marker of [
    'REVIEW_WINNER_PROVENANCE',
    'REPEATED_REVIEW_NO_FRAGMENTS',
    'SUPERSEDED_HEAD_NO_FRAGMENTS',
    'EXPIRY_STALE_STATE_NO_FRAGMENTS',
    'EXTERNAL_EXPIRY_REJECTED',
    'DIRECT_VERSION_MUTATION_DENIED',
    'DOCUMENT_REVIEW_EXPIRY_ROLLBACK_PASS',
  ])
    assert.match(fixture, new RegExp(marker, 'u'));
  assert.match(fixture, /\\set ON_ERROR_STOP on/iu);
  assert.match(fixture, /begin;[\s\S]*rollback;/iu);
  assert.match(runner, /DATABASE_URL is required/iu);
  for (const marker of [
    'REVIEW_VS_REVIEW_ONE_WINNER',
    'SUPERSEDED_HEAD_CONFLICT',
    'EXPIRY_VS_EXPIRY_ONE_WINNER',
    'CONFLICT_AUDIT_ATOMIC',
    'DOCUMENT_REVIEW_EXPIRY_CONCURRENCY_PASS',
  ])
    assert.match(runner, new RegExp(marker, 'u'));
});

test('held-session fixture uses one live company assignment and one assigned actor', () => {
  const setup = compact(setupPath);
  const sessionRunner = compact(sessionRunnerPath);
  const assignmentValues = setup.match(
    /insert into public\.pro_company_assignments\([^;]+?values\s+([^;]+);/iu,
  );

  assert.ok(assignmentValues, 'fixture must seed a live company assignment');
  assert.doesNotMatch(
    assignmentValues[1],
    /\),\s*\(/u,
    'a company may have only one active assignment',
  );
  assert.match(
    sessionRunner,
    /review\(1, 200, 300, 'approved'[\s\S]*review\(1, 200, 300, 'rejected'/u,
  );
  assert.match(
    sessionRunner,
    /expiry\(1, null, '2027-08-13'\)[\s\S]*expiry\(1, null, '2028-08-13'\)/u,
  );
  assert.doesNotMatch(sessionRunner, /review\(2,/u);
  assert.doesNotMatch(sessionRunner, /expiry\(2,/u);
});

test('held-session teardown removes protected fixture children and cannot conceal final cleanup failure', () => {
  const teardown = compact(teardownPath);
  const sessionRunner = compact(sessionRunnerPath);
  const finalCleanup = sessionRunner.slice(sessionRunner.indexOf('} finally {'));

  for (const table of [
    'tenant_audit_log',
    'document_versions',
    'documents',
    'pro_company_assignments',
    'company_profiles',
    'pro_profiles',
    'profiles',
    'tenants',
  ])
    assert.match(teardown, new RegExp(`delete from public\\.${table}`, 'u'));
  assert.doesNotMatch(teardown, /session_replication_role/iu);
  assert.match(
    teardown,
    /alter table public\.document_versions disable trigger document_versions_immutable; delete from public\.document_versions[^;]+; alter table public\.document_versions enable trigger document_versions_immutable;/iu,
    'only the append-only version trigger may be disabled, and it must be restored immediately',
  );
  assert.ok(
    teardown.indexOf('delete from public.document_versions') <
      teardown.indexOf('delete from public.documents'),
    'protected versions must be removed before their document parents',
  );
  assert.ok(
    teardown.indexOf('delete from public.documents') <
      teardown.indexOf('delete from public.tenants'),
    'document children must be removed before the tenant parent',
  );
  assert.match(finalCleanup, /await file\(teardown\)/u);
  assert.doesNotMatch(finalCleanup, /file\(teardown\)\.catch/u);
  assert.match(
    finalCleanup,
    /if \(runError\) throw new AggregateError\(\s*\[runError, cleanupError\]/u,
    'execution and teardown failures must both be preserved',
  );
  assert.match(finalCleanup, /throw cleanupError/u);
  assert.doesNotMatch(finalCleanup, /if \(!runError\) throw cleanupError/u);
});

test('review and expiry function bodies explicitly qualify every relation column', () => {
  const sql = compact(migrationPath);
  const bodies = [
    functionBody(sql, 'review_document_version'),
    functionBody(sql, 'set_pro_document_expiry'),
  ];

  for (const body of bodies) {
    const relationExpressions = body
      .replace(/'(?:''|[^'])*'/gu, "''")
      .replace(/insert into public\.[a-z_]+\s*\([^)]*\)/giu, 'insert into relation')
      .replace(
        /(\bset|,)\s*(?:document_id|company_id|fulfilled_request_id|review_status|reviewed_at|expires_on)\s*=/giu,
        '$1 target_column =',
      );

    assert.doesNotMatch(
      body,
      /(?:from|update) public\.[a-z_]+\s+(?:where|set|for\b)/iu,
      'every read and update relation must declare an explicit alias',
    );
    assert.doesNotMatch(body, /select \*/iu, 'whole-row reads must use their declared alias');
    assert.doesNotMatch(
      relationExpressions,
      /(?<![.\w])\b(?:document_id|company_id|fulfilled_request_id|review_status|reviewed_at|expires_on)\b/iu,
      'RETURNS TABLE output variables must never collide with unqualified relation columns',
    );
  }
});
