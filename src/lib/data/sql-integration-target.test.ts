import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const runnerPath = join(root, 'scripts/run-sql-integration.sh');
const bootstrapPath = join(root, 'scripts/sql-integration/bootstrap.sql');
const recoverySetupPath = join(root, 'scripts/sql-integration/pro-access-recovery-setup.sql');
const recoveryVerifyPath = join(root, 'scripts/sql-integration/pro-access-recovery-verify.sql');
const workflowPath = join(root, '.github/workflows/sql-integration.yml');

test('package and CI execute the isolated PostgreSQL SQL integration target', () => {
  assert.ok(existsSync(runnerPath), 'SQL integration runner is missing');
  assert.ok(existsSync(bootstrapPath), 'isolated PostgreSQL bootstrap is missing');
  assert.ok(existsSync(recoverySetupPath), 'PRO recovery setup is missing');
  assert.ok(existsSync(recoveryVerifyPath), 'PRO recovery verification is missing');
  assert.ok(existsSync(workflowPath), 'SQL integration workflow is missing');

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const runner = readFileSync(runnerPath, 'utf8');
  const bootstrap = readFileSync(bootstrapPath, 'utf8');
  const recoverySetup = readFileSync(recoverySetupPath, 'utf8');
  const recoveryVerify = readFileSync(recoveryVerifyPath, 'utf8');
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.equal(
    packageJson.scripts?.['test:sql:integration'],
    'bash scripts/run-sql-integration.sh',
  );
  assert.match(runner, /public\.ecr\.aws\/supabase\/postgres:17\.11\.0\.006/u);
  assert.match(runner, /trap cleanup EXIT/u);
  assert.match(runner, /20260915090000_0087_reconcile_existing_pro_access\.sql/u);
  assert.match(runner, /MIGRATIONS_APPLIED=.*MIGRATIONS_SKIPPED=/u);
  assert.match(runner, /pro_access_recovery_success/u);
  assert.match(runner, /pro_access_recovery_recovery/u);
  assert.match(runner, /PRODUCTION_PRO_RECOVERY_TARGET_STATE_CHANGED/u);
  assert.match(runner, /PRO_ACCESS_RECOVERY_OK/u);
  assert.match(runner, /recovery_content_digest/u);
  assert.match(runner, /extensions\.digest/u);
  assert.match(runner, /event_queue_foundation\.sql/u);
  assert.match(runner, /p3_10_operational_runtime\.sql/u);
  assert.match(runner, /inbound_webhook_atomic_lifecycle\.sql/u);
  assert.match(runner, /inbound-destination-concurrency-call\.sql/u);
  assert.match(runner, /one mutation and one replay/u);
  assert.match(runner, /ON_ERROR_STOP/u);
  assert.match(runner, /rollback/u);
  assert.match(runner, /PostgreSQL init process complete/u);
  assert.doesNotMatch(runner, /--network[= ]host/u);

  assert.match(recoverySetup, /firm\.mandoob\.local/u);
  assert.match(recoverySetup, /nova\.mandoob\.local/u);
  assert.doesNotMatch(recoverySetup, /@(?:gmail|outlook|hotmail)\./u);
  assert.match(recoveryVerify, /authorize_pro_company_access/u);
  assert.match(recoveryVerify, /read_authoritative_pro_tenant/u);
  assert.match(recoveryVerify, /pro_commercial_terms/u);
  assert.match(recoveryVerify, /array_agg\(profile_id order by profile_id\)/u);

  assert.match(bootstrap, /create or replace function auth\.jwt/u);
  assert.match(bootstrap, /create or replace function auth\.uid/u);
  assert.match(bootstrap, /create table if not exists storage\.buckets/u);
  assert.match(workflow, /npm run test:sql:integration/u);
  assert.doesNotMatch(workflow, /secrets\.|supabase link|project-ref/u);
});
