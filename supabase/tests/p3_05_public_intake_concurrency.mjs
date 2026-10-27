// P3.05 two-session race proofs. Runs actual RPCs against an isolated local stack.
// Never reset or migrate here. Usage: P305_TEST_DB_CONTAINER=supabase_db_mandoob-p305 node this.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const container = process.env.P305_TEST_DB_CONTAINER ?? 'supabase_db_mandoob-p305';
assert.match(container, /^supabase_db_mandoob-p305/, 'Dedicated P3.05 database container required');

const baseArgs = [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-qAt',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];

function runSyncSql(sql) {
  const r = spawnSync('docker', baseArgs, {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: 'postgres' },
  });
  return { code: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function runAsyncSql(sql) {
  return new Promise((resolve) => {
    const child = spawn('docker', baseArgs, { env: { ...process.env, PGPASSWORD: 'postgres' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.end(sql);
  });
}

const hex = (c) => c.repeat(64);

// Race 1: concurrent identical contact accepts must collapse to one row / one receipt.
const OP1 = '00000000-0000-4000-8000-0000000000a1';
const accept = `select (public.accept_public_contact('${OP1}', '${hex('c')}', '{"email":"race@b.co"}'::jsonb, 'v1', now(), '${hex('d')}'))->>'contactId';`;
const [r1a, r1b] = await Promise.all([runAsyncSql(accept), runAsyncSql(accept)]);
assert.equal(r1a.code, 0, `accept A failed: ${r1a.err}`);
assert.equal(r1b.code, 0, `accept B failed: ${r1b.err}`);
assert.equal(r1a.out, r1b.out, 'concurrent identical contact accepts returned different ids');
const rows = runSyncSql(
  `select count(*) from public.public_contact_intakes where operation_id = '${OP1}';`,
);
assert.equal(rows.out, '1', `expected exactly one intake row, got ${rows.out}`);
console.log('RACE1_IDEMPOTENT_REPLAY_OK', r1a.out);

// Race 2: fixture draft, then two concurrent saves at the same expected_version.
const ADMIN = '00000000-0000-4000-8000-0000000000b1';
const DEF = '00000000-0000-4000-8000-0000000000b2';
const DRAFT = '00000000-0000-4000-8000-0000000000b3';
const setup = runSyncSql(`
insert into auth.users(id, email) values ('${ADMIN}', 'race-admin@p305.local') on conflict do nothing;
insert into public.profiles(id, role, status, tenant_id) values ('${ADMIN}', 'super_admin', 'active', null) on conflict do nothing;
insert into public.questionnaire_definitions(id, definition_key, title, current_draft_version, current_published_version, row_version)
  values ('${DEF}', 'race-questionnaire', 'Race', 1, 1, 1) on conflict do nothing;
insert into public.questionnaire_definition_versions(definition_id, version, state, definition, definition_hash, created_by, published_at)
  values ('${DEF}', 1, 'published', '{"key":"race-questionnaire","version":1,"sections":[]}'::jsonb, '${hex('a')}', '${ADMIN}', now()) on conflict do nothing;
insert into public.public_application_drafts(id, definition_id, definition_version, resume_secret_hash, expires_at)
  values ('${DRAFT}', '${DEF}', 1, '${hex('b')}', now() + interval '7 days') on conflict do nothing;
select 'SETUP_OK';`);
assert.equal(setup.code, 0, `setup failed: ${setup.err}`);

const save = (op) =>
  `select (public.save_public_application_draft('${DRAFT}', '${hex('b')}', '${op}', '${hex('c')}', 1, '{"fullName":"Racer"}'::jsonb))->>'version';`;
const [r2a, r2b] = await Promise.all([
  runAsyncSql(save('00000000-0000-4000-8000-0000000000c1')),
  runAsyncSql(save('00000000-0000-4000-8000-0000000000c2')),
]);
const successes = [r2a, r2b].filter((r) => r.code === 0);
const conflicts = [r2a, r2b].filter((r) => r.code !== 0 && /STALE_DRAFT_VERSION/.test(r.err));
assert.equal(successes.length, 1, `expected exactly one save to succeed, got ${successes.length}`);
assert.equal(
  conflicts.length,
  1,
  `expected exactly one stale-version conflict, got ${conflicts.length}`,
);
assert.equal(
  successes[0].out,
  '2',
  `winning save should bump to version 2, got ${successes[0].out}`,
);
console.log('RACE2_OPTIMISTIC_CONCURRENCY_OK');

console.log('P3_05_CONCURRENCY_OK');
