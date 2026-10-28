import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const runnerPath = join(root, 'scripts/run-sql-integration.sh');
const bootstrapPath = join(root, 'scripts/sql-integration/bootstrap.sql');
const workflowPath = join(root, '.github/workflows/sql-integration.yml');

test('package and CI execute the isolated PostgreSQL SQL integration target', () => {
  assert.ok(existsSync(runnerPath), 'SQL integration runner is missing');
  assert.ok(existsSync(bootstrapPath), 'isolated PostgreSQL bootstrap is missing');
  assert.ok(existsSync(workflowPath), 'SQL integration workflow is missing');

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const runner = readFileSync(runnerPath, 'utf8');
  const bootstrap = readFileSync(bootstrapPath, 'utf8');
  const workflow = readFileSync(workflowPath, 'utf8');

  assert.equal(
    packageJson.scripts?.['test:sql:integration'],
    'bash scripts/run-sql-integration.sh',
  );
  assert.match(runner, /public\.ecr\.aws\/supabase\/postgres:17\.11\.0\.006/u);
  assert.match(runner, /trap cleanup EXIT/u);
  assert.match(runner, /20260915090000_0087_reconcile_existing_pro_access\.sql/u);
  assert.match(runner, /launch blocker/u);
  assert.match(runner, /event_queue_foundation\.sql/u);
  assert.match(runner, /p3_10_operational_runtime\.sql/u);
  assert.match(runner, /inbound_webhook_atomic_lifecycle\.sql/u);
  assert.match(runner, /inbound-destination-concurrency-call\.sql/u);
  assert.match(runner, /one mutation and one replay/u);
  assert.match(runner, /ON_ERROR_STOP/u);
  assert.match(runner, /rollback/u);
  assert.match(runner, /PostgreSQL init process complete/u);
  assert.doesNotMatch(runner, /--network[= ]host/u);

  assert.match(bootstrap, /create or replace function auth\.jwt/u);
  assert.match(bootstrap, /create or replace function auth\.uid/u);
  assert.match(bootstrap, /create table if not exists storage\.buckets/u);
  assert.match(workflow, /npm run test:sql:integration/u);
  assert.doesNotMatch(workflow, /secrets\.|supabase link|project-ref/u);
});
