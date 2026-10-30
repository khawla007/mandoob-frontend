import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Explicit infrastructure gate. NEVER invoked by the ordinary source unit suite.
// Requires an explicit verified-empty owned fixture; root serializes its CLI reset.
const container = 'supabase_db_mandoob-p307-foundation-JI3gjzGi';
const originalFixture = process.argv.includes('--owned-empty-fixture');
const expectedNowait = process.argv.includes('--expected-nowait');
const database = 'postgres';
const timeoutMs = 1_500;
const sqlPath = fileURLToPath(new URL('./document_upload_lifecycle.sql', import.meta.url));
const active = new Set();
let assertions = 0;
let failures = 0;

function command(args, input = '', timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    active.add(child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error('OWNED_DOCKER_COMMAND_FAILED')));
    child.on('close', (code) => {
      clearTimeout(timer);
      active.delete(child);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function psql(sql) {
  return command(
    [
      'psql',
      '-X',
      '-q',
      '-A',
      '-t',
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-f',
      '-',
    ],
    sql,
  );
}

function check(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.log(`FAIL_${label}`);
  }
}

async function holder(lockSql) {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-q',
      '-A',
      '-t',
      '-U',
      'postgres',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  active.add(child);
  let output = '';
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const timer = setTimeout(() => rejectReady(new Error('LOCK_BARRIER_TIMEOUT')), 15_000);
  child.stdout.on('data', (data) => {
    output += data;
    if (output.includes('LOCK_BARRIER_READY')) {
      clearTimeout(timer);
      resolveReady();
    }
  });
  // Do not emit SQL/private IDs/raw backend errors.
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {});
  const closed = new Promise((resolve) =>
    child.on('close', (code) => {
      clearTimeout(timer);
      active.delete(child);
      rejectReady(new Error('LOCK_BARRIER_CLOSED'));
      resolve(code);
    }),
  );
  child.on('error', () => rejectReady(new Error('LOCK_BARRIER_SPAWN_FAILED')));
  child.stdin.write(
    `begin; set local statement_timeout='10s'; ${lockSql}; select 'LOCK_BARRIER_READY';\n`,
  );
  try {
    await ready;
  } catch (error) {
    child.stdin.end('rollback;\n');
    const cleanupTimer = setTimeout(() => child.kill('SIGTERM'), 5_000);
    await closed;
    clearTimeout(cleanupTimer);
    throw error;
  }
  return async () => {
    child.stdin.end('rollback;\n');
    return closed;
  };
}

function uid(n) {
  return `doc_lock_contract.uid(${n})`;
}
function prepare(op) {
  const employee = op === 7002;
  return `doc_lock_contract.prepare(3,${op},jsonb_build_object('type','${employee ? 'passport' : 'visa'}',
    'request',${uid(employee ? 120 : 122)}${employee ? `,'employee',${uid(110)}` : ''}))`;
}
function rpc(kind, op) {
  if (kind === 'PREPARE') return prepare(op);
  if (kind === 'FINALIZE') return `doc_lock_contract.finish(3,${op})`;
  return `public.get_document_upload_receipt(${uid(3)},${uid(100)},${uid(101)},${uid(op)})`;
}

async function contention(label, lockSql, kinds = ['PREPARE', 'FINALIZE', 'RECEIPT'], op = 7000) {
  const release = await holder(lockSql);
  try {
    for (const kind of kinds) {
      const result = await psql(`set statement_timeout='${timeoutMs}ms';
        do $$ begin
          begin perform ${rpc(kind, op)};
          exception when sqlstate 'DU409' then return;
            when sqlstate '57014' then raise exception 'LOCK_CONTRACT_BLOCKED';
          end;
          raise exception 'LOCK_CONTRACT_MISSING';
        end; $$;
        select 'LOCK_CONTRACT_OK';`);
      check(
        result.code === 0 && result.stdout.includes('LOCK_CONTRACT_OK'),
        `${label}_${kind}_PROMPT_CONFLICT`,
      );
    }
  } finally {
    check((await release()) === 0, `${label}_HOLDER_ROLLBACK`);
  }
  const invariant = await psql(`select case when
    (select count(*) from public.document_upload_operations)=2
    and not exists(select 1 from public.document_versions)
    and not exists(select 1 from public.document_lifecycle_audit)
    and not exists(select 1 from public.documents where current_version_id is not null)
    and not exists(select 1 from public.document_upload_operations where state<>'prepared' or committed_receipt is not null)
    and not exists(select 1 from public.document_requests where status<>'pending')
    then 'NO_PUBLICATION_FRAGMENTS' else 'PUBLICATION_FRAGMENT' end;`);
  check(
    invariant.code === 0 && invariant.stdout.includes('NO_PUBLICATION_FRAGMENTS'),
    `${label}_NO_FRAGMENTS_OR_LEASE_DRIFT`,
  );
}

try {
  if (!originalFixture) throw new Error('OWNED_EMPTY_FIXTURE_MODE_REQUIRED');
  {
    // Explicit root-coordinated fallback only. Never DROP/reset the original DB.
    // Root replays its digest-verified immutable migrations after this gate.
    const expectedHistory = expectedNowait ? 107 : 106;
    const expectedVersion = expectedNowait ? '20260916040300' : '20260916040200';
    const empty = await psql(`select case when
      not exists(select 1 from auth.users)
      and not exists(select 1 from public.company_profiles)
      and not exists(select 1 from public.documents)
      and not exists(select 1 from public.document_versions)
      and not exists(select 1 from public.document_requests)
      and not exists(select 1 from public.document_upload_operations)
      and not exists(select 1 from public.document_lifecycle_audit)
      and not exists(select 1 from pg_namespace where nspname='doc_lock_contract')
      and (select count(*) from supabase_migrations.schema_migrations)=${expectedHistory}
      and (select max(version) from supabase_migrations.schema_migrations)='${expectedVersion}'
      then 'OWNED_FIXTURE_EMPTY_VERIFIED' else 'OWNED_FIXTURE_NOT_EMPTY' end;`);
    if (empty.code !== 0 || !empty.stdout.includes('OWNED_FIXTURE_EMPTY_VERIFIED'))
      throw new Error('OWNED_FIXTURE_NOT_EMPTY_OR_BASELINE_MISMATCH');
  }

  const source = readFileSync(sqlPath, 'utf8');
  const marker = 'do $$\ndeclare n text;';
  const boundary = source.indexOf(marker);
  if (boundary < 0) throw new Error('SYNTHETIC_FIXTURE_BOUNDARY_MISSING');
  const fixture = source.slice(0, boundary).replaceAll('pg_temp.', 'doc_lock_contract.');
  const setup = await psql(`create schema doc_lock_contract;\n${fixture}
    insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false) on conflict(id) do nothing;
    select doc_lock_contract.check((select public=false from storage.buckets where id='tenant-documents'),'PRIVATE_STORAGE_BUCKET');
    insert into public.documents(id,tenant_id,company_id,request_id,employee_id,doc_type)
      values (${uid(7100)},${uid(100)},${uid(101)},${uid(122)},null,'visa'),
        (${uid(7102)},${uid(100)},${uid(101)},${uid(120)},${uid(110)},'passport');
    select ${prepare(7000)}; select doc_lock_contract.object(7000);
    select ${prepare(7002)}; select doc_lock_contract.object(7002);
    commit;`);
  if (setup.code !== 0) throw new Error('OWNED_SYNTHETIC_FIXTURE_FAILED');

  // Equivalent inverse-order row-lock simulations, not claims of end-to-end
  // P303 lifecycle execution. A holder's returned barrier proves the lock exists.
  for (const [label, table, where] of [
    ['COMPANY', 'company_profiles', `id=${uid(101)}`],
    ['TENANT', 'tenants', `id=${uid(100)}`],
    ['PROFILE', 'profiles', `id=${uid(3)}`],
    ['CREDENTIAL', 'pro_credentials', `id=${uid(30)}`],
    ['ASSIGNMENT', 'pro_company_assignments', `id=${uid(31)}`],
    ['REQUEST', 'document_requests', `id=${uid(122)}`],
    ['HEAD', 'documents', `id=${uid(7100)}`],
    ['OPERATION', 'document_upload_operations', `operation_id=${uid(7000)}`],
  ])
    await contention(label, `select 1 from public.${table} where ${where} for update`);
  await contention(
    'EMPLOYEE',
    `select 1 from public.employees where id=${uid(110)} for update`,
    undefined,
    7002,
  );
  await contention(
    'STORAGE',
    `select 1 from storage.objects where bucket_id='tenant-documents'
    and name=(select storage_path from public.document_upload_operations where operation_id=${uid(7000)}) for update`,
    ['FINALIZE'],
  );
  await contention(
    'NEW_PREPARE_HEAD',
    `select 1 from public.documents where id=${uid(7100)} for update`,
    ['PREPARE'],
    7003,
  );
  const retry = await psql(`do $$ declare first jsonb; replay jsonb; begin
    perform ${prepare(7000)};
    first := doc_lock_contract.finish(3,7000);
    replay := doc_lock_contract.finish(3,7000);
    if first is distinct from replay or first is distinct from ${prepare(7000)}
      or first is distinct from public.get_document_upload_receipt(${uid(3)},${uid(100)},${uid(101)},${uid(7000)})
      or (select count(*) from public.document_versions)<>1
      or (select count(*) from public.document_lifecycle_audit)<>1
      or not (select status='fulfilled' from public.document_requests where id=${uid(122)}) then
      raise exception 'POST_RELEASE_RETRY_INVALID';
    end if;
    end; $$; select 'POST_RELEASE_RETRY_STABLE_EXACTLY_ONCE';`);
  check(
    retry.code === 0 && retry.stdout.includes('POST_RELEASE_RETRY_STABLE_EXACTLY_ONCE'),
    'POST_RELEASE_RETRY_STABLE_EXACTLY_ONCE',
  );
} catch (error) {
  failures += 1;
  console.log(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? `FAIL_${error.message}`
      : 'FAIL_CONTRACT_RUNNER',
  );
} finally {
  for (const child of active) child.stdin.end('rollback;\n');
  if (originalFixture) console.log('OWNED_FIXTURE_REQUIRES_ROOT_RESET');
  console.log(`DOCUMENT_UPLOAD_LOCK_ASSERTIONS_${assertions}_FAILURES_${failures}`);
  process.exitCode = failures ? 1 : 0;
}
