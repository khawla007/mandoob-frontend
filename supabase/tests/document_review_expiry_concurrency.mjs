import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const setup = fileURLToPath(
  new URL('./document_review_expiry_concurrency_setup.sql', import.meta.url),
);
const teardown = fileURLToPath(
  new URL('./document_review_expiry_concurrency_teardown.sql', import.meta.url),
);
const active = new Set();

function psql(args = [], input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [databaseUrl, '-X', '-q', '-A', '-t', '--set=ON_ERROR_STOP=1', ...args],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    active.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      active.delete(child);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function file(path) {
  const result = await psql(['-f', path]);
  if (result.code !== 0) throw new Error('FIXTURE_SQL_FAILED');
}

async function held(holderSql, contenderSql, expectedMessage) {
  const holder = spawn('psql', [databaseUrl, '-X', '-q', '-A', '-t', '--set=ON_ERROR_STOP=1'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  active.add(holder);
  let output = '';
  let errors = '';
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const timer = setTimeout(() => readyReject(new Error('HELD_SESSION_TIMEOUT')), 10_000);
  holder.stdout.on('data', (chunk) => {
    output += chunk;
    if (output.includes('HELD_SESSION_READY')) {
      clearTimeout(timer);
      readyResolve();
    }
  });
  holder.stderr.on('data', (chunk) => (errors += chunk));
  const closed = new Promise((resolve) =>
    holder.on('close', (code) => {
      active.delete(holder);
      resolve(code);
    }),
  );
  holder.on('error', readyReject);
  holder.stdin.end(holderSql);
  await ready;
  const contender = await psql([], contenderSql);
  const holderCode = await closed;
  if (holderCode !== 0 || errors) throw new Error('HELD_SESSION_FAILED');
  if (contender.code === 0 || !contender.stderr.includes(expectedMessage)) {
    throw new Error('CONTENDER_DID_NOT_CONFLICT');
  }
}

const id = (n) => `'99030772-0000-4000-8000-${String(n).padStart(12, '0')}'::uuid`;
const review = (actor, document, version, status, note) => `
  set role service_role;
  select * from public.review_document_version(
    ${id(100)},${id(actor)},${id(101)},${id(document)},${id(version)},${id(version)},
    'pending','${status}',${note === null ? 'null' : `'${note}'`}
  );`;
const expiry = (actor, expected, next) => `
  set role service_role;
  select * from public.set_pro_document_expiry(
    ${id(100)},${id(actor)},${id(101)},${id(201)},${id(301)},
    ${expected === null ? 'null' : `'${expected}'::date`},'${next}'::date
  );`;

let success = false;
let runError;
try {
  await file(teardown).catch(() => {});
  await file(setup);

  await held(
    `begin;${review(1, 200, 300, 'approved', 'Winner')}
     reset role; select 'HELD_SESSION_READY'; select pg_sleep(1); commit;`,
    `${review(1, 200, 300, 'rejected', 'Loser')}`,
    'document_review_conflict',
  );
  console.log('REVIEW_VS_REVIEW_ONE_WINNER');

  await held(
    `begin; update public.documents set current_version_id=${id(303)} where id=${id(202)};
     select 'HELD_SESSION_READY'; select pg_sleep(1); commit;`,
    `${review(1, 202, 302, 'approved', null)}`,
    'document_review_conflict',
  );
  console.log('SUPERSEDED_HEAD_CONFLICT');

  await held(
    `begin;${expiry(1, null, '2027-08-13')}
     reset role; select 'HELD_SESSION_READY'; select pg_sleep(1); commit;`,
    `${expiry(1, null, '2028-08-13')}`,
    'document_expiry_conflict',
  );
  console.log('EXPIRY_VS_EXPIRY_ONE_WINNER');

  const invariant = await psql(
    [],
    `select case when
    (select review_status='approved' and review_note='Winner' from public.document_versions where id=${id(300)})
    and (select current_version_id=${id(303)} from public.documents where id=${id(202)})
    and (select expires_on='2027-08-13'::date from public.documents where id=${id(201)})
    and (select count(*)=2 from public.tenant_audit_log where tenant_id=${id(100)}
      and details->>'op' in ('review','set_expiry'))
    then 'CONFLICT_AUDIT_ATOMIC' else 'INVARIANT_FAILED' end;`,
  );
  if (invariant.code !== 0 || !invariant.stdout.includes('CONFLICT_AUDIT_ATOMIC')) {
    throw new Error('CONFLICT_FRAGMENT_DETECTED');
  }
  console.log('CONFLICT_AUDIT_ATOMIC');
  console.log('DOCUMENT_REVIEW_EXPIRY_CONCURRENCY_PASS');
  success = true;
} catch (error) {
  runError = error;
  throw error;
} finally {
  for (const child of active) child.kill('SIGTERM');
  try {
    await file(teardown);
  } catch (cleanupError) {
    if (runError)
      throw new AggregateError(
        [runError, cleanupError],
        'DOCUMENT_REVIEW_EXPIRY_RUN_AND_CLEANUP_FAILED',
      );
    throw cleanupError;
  }
}

if (!success) process.exitCode = 1;
