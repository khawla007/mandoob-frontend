import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Explicit Docker infrastructure gate; never imported by source unit tests.
// Only root may reset this uniquely owned ephemeral fixture after this runner.
// SQL metadata simulation only: no physical blob deletion/rollback proof.
const container = 'supabase_db_mandoob-p307-foundation-JI3gjzGi';
const owned = process.argv.includes('--owned-empty-fixture');
const red = process.argv.includes('--expected-red');
const active = new Set();
let assertions = 0;
let failures = 0;
function check(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.log(`FAIL_${label}`);
  }
}
function client(sql, barrier = false) {
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
      'postgres',
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
  if (!barrier) ready.catch(() => {});
  const timer = setTimeout(() => child.kill('SIGTERM'), 20_000);
  child.stdout.on('data', (data) => {
    output += data;
    if (output.includes('CLEANUP_BARRIER_READY')) resolveReady();
  });
  // Never emit SQL, private identifiers, paths, keys, or raw provider errors.
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {});
  child.on('error', () => rejectReady(new Error('CLEANUP_CLIENT_SPAWN_FAILED')));
  const done = new Promise((resolve) =>
    child.on('close', (code) => {
      clearTimeout(timer);
      active.delete(child);
      rejectReady(new Error('CLEANUP_BARRIER_CLOSED'));
      resolve({ code, output });
    }),
  );
  if (barrier)
    child.stdin.write(
      `begin; set local statement_timeout='15s'; ${sql}; select 'CLEANUP_BARRIER_READY';\n`,
    );
  else child.stdin.end(`set statement_timeout='10s'; ${sql}\n`);
  return {
    ready,
    done,
    release: (commit) => {
      child.stdin.end(commit ? 'commit;\n' : 'rollback;\n');
      return done;
    },
  };
}
function psql(sql) {
  return client(sql).done;
}
function uid(n) {
  return `doc_cleanup_contract.uid(${n})`;
}
function claim(op, lease = 300) {
  return `public.claim_document_upload_cleanup(${uid(100)},${uid(101)},${uid(op)},${lease})`;
}
function fence(op) {
  return `(select cleanup_fence from public.document_upload_operations where operation_id=${uid(op)})`;
}
function authorize(op) {
  return `public.authorize_document_upload_cleanup(${uid(100)},${uid(101)},${uid(op)},${fence(op)})`;
}
function hold(op) {
  return `public.set_document_upload_cleanup_hold(${uid(100)},${uid(101)},${uid(op)},true)`;
}
function finish(op) {
  return `doc_cleanup_contract.finish(3,${op})`;
}
function complete(op, token, deleted) {
  return `public.complete_document_upload_cleanup(${uid(100)},${uid(101)},${uid(op)},${token},${deleted})`;
}
function rejected(expression) {
  return `do $$ begin begin perform ${expression}; exception when sqlstate 'DU409' then return; end;
    raise exception 'EXPECTED_CONFLICT_MISSING'; end; $$; select 'CLEANUP_EXPECTED_CONFLICT';`;
}
async function fresh(op) {
  const result =
    await psql(`select doc_cleanup_contract.prepare(3,${op},jsonb_build_object('type','other',
    'head',(select current_version_id from public.documents where tenant_id=${uid(100)} and company_id=${uid(101)}
      and request_id is null and employee_id is null and doc_type='other'))); select doc_cleanup_contract.object(${op});`);
  check(result.code === 0, 'FRESH_RESERVATION');
  if (result.code !== 0) throw new Error('CLEANUP_FRESH_SETUP_FAILED');
}
async function race(label, winnerSql, loserSql, afterSql, waits = true) {
  const winner = client(winnerSql, true);
  try {
    await winner.ready;
    check(true, `${label}_RETURNED_BARRIER`);
    const loser = client(`set application_name='document_cleanup_race_waiter'; ${loserSql}`);
    let waited = !waits;
    for (let attempt = 0; waits && attempt < 30; attempt += 1) {
      const probe = await psql(`select case when exists(select 1 from pg_stat_activity
        where application_name='document_cleanup_race_waiter' and wait_event='advisory')
        then 'CLEANUP_WAITER_BLOCKED' else 'CLEANUP_WAITER_NOT_BLOCKED' end; select pg_sleep(0.05);`);
      if (probe.output.includes('CLEANUP_WAITER_BLOCKED')) {
        waited = true;
        break;
      }
    }
    check(waited, `${label}_${waits ? 'ACTUAL_ADVISORY_CONTENTION' : 'CONTESTED_NOWAIT_ROW'}`);
    if (!waits) {
      const prompt = await loser.done;
      check(
        prompt.code === 0 && prompt.output.includes('CLEANUP_EXPECTED_CONFLICT'),
        `${label}_PRE_RELEASE_PROMPT_CONFLICT`,
      );
    }
    check((await winner.release(true)).code === 0, `${label}_WINNER_COMMIT`);
    const result = await loser.done;
    check(
      result.code === 0 && result.output.includes('CLEANUP_EXPECTED_CONFLICT'),
      `${label}_LOSER_FIXED_CONFLICT`,
    );
    const invariant = await psql(`${afterSql}; select 'CLEANUP_RACE_INVARIANT_OK';`);
    check(
      invariant.code === 0 && invariant.output.includes('CLEANUP_RACE_INVARIANT_OK'),
      `${label}_DURABLE_INVARIANT`,
    );
  } finally {
    if (active.size) await winner.release(false);
  }
}
try {
  if (!owned) throw new Error('OWNED_EMPTY_FIXTURE_FLAG_REQUIRED');
  const empty =
    await psql(`select case when (select count(*) from supabase_migrations.schema_migrations)=${red ? 107 : 108}
    and (select max(version) from supabase_migrations.schema_migrations)='${red ? '20260916040300' : '20260916040400'}'
    and not exists(select 1 from auth.users) and not exists(select 1 from public.document_upload_operations)
    and not exists(select 1 from public.document_versions) and not exists(select 1 from public.document_lifecycle_audit)
    and not exists(select 1 from storage.objects where bucket_id='tenant-documents')
    and not exists(select 1 from pg_namespace where nspname in ('doc_cleanup_contract','doc_lock_contract'))
    then 'OWNED_CLEANUP_FIXTURE_EMPTY' else 'OWNED_CLEANUP_FIXTURE_NOT_EMPTY' end;`);
  if (empty.code !== 0 || !empty.output.includes('OWNED_CLEANUP_FIXTURE_EMPTY'))
    throw new Error('OWNED_CLEANUP_FIXTURE_BASELINE_MISMATCH');
  const source = readFileSync(
    fileURLToPath(new URL('./document_upload_lifecycle.sql', import.meta.url)),
    'utf8',
  );
  const boundary = source.indexOf('do $$\ndeclare n text;');
  if (boundary < 0) throw new Error('CLEANUP_FIXTURE_BOUNDARY_MISSING');
  const fixture = source.slice(0, boundary).replaceAll('pg_temp.', 'doc_cleanup_contract.');
  const setup =
    await psql(`create schema doc_cleanup_contract; revoke all on schema doc_cleanup_contract from public,anon,authenticated,service_role;
    ${fixture}
    insert into storage.buckets(id,name,public) values('tenant-documents','tenant-documents',false) on conflict(id) do nothing;
    commit;`);
  if (setup.code !== 0) throw new Error('OWNED_CLEANUP_SYNTHETIC_FIXTURE_FAILED');
  await fresh(8000);
  if (red) {
    const missing = await psql(`select ${claim(8000)};`);
    check(missing.code === 0, 'INHERITED_CLEANUP_CLAIM_REQUIRED');
  } else {
    await race(
      'FINALIZER_WINS',
      `select ${finish(8000)}`,
      rejected(claim(8000)),
      `select doc_cleanup_contract.check((select state='finalized' and committed_receipt is not null
        from public.document_upload_operations where operation_id=${uid(8000)}),'FINALIZED_SURVIVES')`,
    );
    await fresh(8001);
    await race(
      'CLEANUP_WINS',
      `select ${claim(8001)}`,
      rejected(finish(8001)),
      `select doc_cleanup_contract.check((select state='cleanup_pending' from public.document_upload_operations
        where operation_id=${uid(8001)}),'CLAIM_NO_RESURRECTION')`,
    );
    await fresh(8002);
    await race(
      'HOLD_WINS',
      `select ${hold(8002)}`,
      rejected(claim(8002)),
      `select doc_cleanup_contract.check((select state='prepared' and cleanup_hold from public.document_upload_operations
        where operation_id=${uid(8002)}),'HELD_RESERVATION_PRESERVED')`,
    );
    await fresh(8010);
    const heldAuthorizationSetup = await psql(`select ${claim(8010)};
      select doc_cleanup_contract.check((select state='cleanup_pending' and cleanup_fence is not null
        and not cleanup_hold and not cleanup_authorized from public.document_upload_operations
        where operation_id=${uid(8010)}),'HOLD_AUTHORIZATION_CLAIM_SETUP');
      select 'HOLD_AUTHORIZATION_CLAIM_READY';`);
    const heldAuthorizationReady =
      heldAuthorizationSetup.code === 0 &&
      heldAuthorizationSetup.output.includes('HOLD_AUTHORIZATION_CLAIM_READY');
    check(heldAuthorizationReady, 'HOLD_AUTHORIZATION_CLAIM_SETUP');
    if (!heldAuthorizationReady) throw new Error('HOLD_AUTHORIZATION_CLAIM_SETUP_FAILED');
    await race(
      'HOLD_WINS_AUTHORIZATION',
      `select ${hold(8010)}`,
      rejected(authorize(8010)),
      `select doc_cleanup_contract.check((select state='cleanup_pending' and cleanup_hold and not cleanup_authorized
        from public.document_upload_operations where operation_id=${uid(8010)})
        and not exists(select 1 from public.document_lifecycle_audit
          where operation_id=${uid(8010)} and event='upload_cleanup_authorized'),'HELD_AUTHORIZATION_DENIED_NO_AUDIT')`,
    );
    await fresh(8003);
    await psql(`select ${claim(8003)};`);
    await race(
      'AUTHORIZATION_WINS',
      `select ${authorize(8003)}`,
      rejected(hold(8003)),
      `select doc_cleanup_contract.check((select cleanup_authorized and not cleanup_hold from public.document_upload_operations
        where operation_id=${uid(8003)}),'LATE_HOLD_CANNOT_RACE_DELETE')`,
    );
    await fresh(8004);
    await race(
      'STORAGE_WRITER_WINS',
      `update storage.objects set metadata=metadata||'{"fixture":true}'::jsonb
      where name=(select storage_path from public.document_upload_operations where operation_id=${uid(8004)})`,
      rejected(claim(8004)),
      `select doc_cleanup_contract.check((select state='prepared' from public.document_upload_operations
        where operation_id=${uid(8004)}),'WRITER_CONFLICT_NO_MUTATION')`,
      false,
    );
    await race(
      'CLAIM_BLOCKS_LATE_WRITER',
      `select ${claim(8004)}`,
      rejected('doc_cleanup_contract.object(8004)'),
      `select doc_cleanup_contract.check((select state='cleanup_pending' from public.document_upload_operations
        where operation_id=${uid(8004)}),'WRITER_DURABLY_FENCED')`,
      false,
    );
    // Fresh one-second lease, real deadline passage, then a new worker fence.
    await fresh(8005);
    const lease =
      await psql(`create table doc_cleanup_contract.lease_probe as select ${claim(8005, 1)} as receipt;
      select pg_sleep(1.1);
      select doc_cleanup_contract.check((select cleanup_lease_until<clock_timestamp() from public.document_upload_operations
        where operation_id=${uid(8005)}),'LEASE_ACTUALLY_EXPIRED');
      ${rejected(finish(8005))}
      select doc_cleanup_contract.check(((${claim(8005)})->>'fence') is distinct from
        (select receipt->>'fence' from doc_cleanup_contract.lease_probe),'REPLACEMENT_FENCE_FRESH');
      select doc_cleanup_contract.check((select storage_path from public.document_upload_operations where operation_id=${uid(8005)})=
        (select receipt->>'storagePath' from doc_cleanup_contract.lease_probe),'REPLACEMENT_PATH_IMMUTABLE');
      ${rejected(`public.authorize_document_upload_cleanup(${uid(100)},${uid(101)},${uid(8005)},(select (receipt->>'fence')::uuid from doc_cleanup_contract.lease_probe))`)}
      ${rejected(complete(8005, `(select (receipt->>'fence')::uuid from doc_cleanup_contract.lease_probe)`, true))}
      select ${authorize(8005)}; select ${complete(8005, fence(8005), false)};
      select doc_cleanup_contract.check((select state='cleanup_pending' from public.document_upload_operations where operation_id=${uid(8005)}),'FAILURE_DURABLE');
      ${rejected(`doc_cleanup_contract.object(8005)`)}
      -- Synthetic metadata deletion only; no physical blob acceptance.
      begin;
      select pg_catalog.set_config('storage.allow_delete_query','true',true);
      delete from storage.objects where bucket_id='tenant-documents' and name=(select storage_path from public.document_upload_operations where operation_id=${uid(8005)});
      select pg_catalog.set_config('storage.allow_delete_query','false',true);
      commit;
      select ${complete(8005, fence(8005), true)};
      ${rejected(`doc_cleanup_contract.object(8005)`)}
      select 'LEASE_FENCING_RETRY_OK';`);
    check(
      lease.code === 0 && lease.output.includes('LEASE_FENCING_RETRY_OK'),
      'STALE_LEASE_REPLACEMENT_FAILURE_RETRY',
    );
    await fresh(8008);
    const referenceParent =
      await psql(`select doc_cleanup_contract.check(exists(select 1 from public.documents d
      join public.document_upload_operations o on o.document_id=d.id and o.tenant_id=d.tenant_id and o.company_id=d.company_id
      where o.operation_id=${uid(8008)}),'REFERENCE_PARENT_PRESENT'); select 'REFERENCE_PARENT_PROVEN';`);
    check(
      referenceParent.code === 0 && referenceParent.output.includes('REFERENCE_PARENT_PROVEN'),
      'REFERENCE_PARENT_FK_PROVEN',
    );
    await race(
      'REFERENCE_WINS',
      `insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,
      size_bytes,sha256,uploaded_by,upload_operation_id)
      select reserved_version_id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,actor_id,operation_id
      from public.document_upload_operations where operation_id=${uid(8008)}`,
      rejected(claim(8008)),
      `select doc_cleanup_contract.check(exists(select 1 from public.document_versions where upload_operation_id=${uid(8008)})
        and (select state='prepared' from public.document_upload_operations where operation_id=${uid(8008)}),'REFERENCED_OBJECT_PRESERVED')`,
    );
    // Held customer link regression: no change to P303 assignments/credentials.
    await fresh(8006);
    const customerHolder = client(
      `select 1 from public.customer_profiles where profile_id=${uid(4)} for update`,
      true,
    );
    try {
      await customerHolder.ready;
      const blocked = await psql(
        `select doc_cleanup_contract.reject_prepare(4,8007,'{}','DU409'); select 'CUSTOMER_LOCK_FIXED_CONFLICT';`,
      );
      check(
        blocked.code === 0 && blocked.output.includes('CUSTOMER_LOCK_FIXED_CONFLICT'),
        'CUSTOMER_LINK_NOWAIT',
      );
    } finally {
      check((await customerHolder.release(false)).code === 0, 'CUSTOMER_HOLDER_ROLLBACK');
    }
    const immutable =
      await psql(`select doc_cleanup_contract.check((select count(*) from public.document_versions)=2
      and (select count(*) from public.document_lifecycle_audit where event='upload_finalized')=1,'FINALIZED_AUDIT_HISTORY_PRESERVED');
      select 'CLEANUP_HISTORY_PRESERVED';`);
    check(
      immutable.code === 0 && immutable.output.includes('CLEANUP_HISTORY_PRESERVED'),
      'FINALIZED_VERSION_AND_AUDIT_PRESERVED',
    );
  }
} catch (error) {
  failures += 1;
  console.log(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? `FAIL_${error.message}`
      : 'FAIL_CLEANUP_RUNNER',
  );
} finally {
  for (const child of active) child.stdin.end('rollback;\n');
  if (owned) console.log('OWNED_FIXTURE_REQUIRES_ROOT_RESET');
  console.log(`DOCUMENT_UPLOAD_CLEANUP_ASSERTIONS_${assertions}_FAILURES_${failures}`);
  process.exitCode = failures ? 1 : 0;
}
