// Final-schema P3.03/P3.10 assignment/commercial-term races. Never resets, migrates, or drops a database.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const expectedContainer = 'supabase_db_mandoob-p303-combined-j3xcqw';
const container = process.env.P303_COMBINED_DB_CONTAINER;
assert.equal(
  container,
  expectedContainer,
  `Exact disposable container ${expectedContainer} required`,
);

const id = (n) => `95330000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1);
const assignmentFirstPro = id(2);
const termFirstPro = id(3);
const assignmentFirstTenant = id(10);
const termFirstTenant = id(11);
const assignmentFirstCompany = id(20);
const termFirstCompany = id(21);
const assignmentFirstCredential = id(30);
const termFirstCredential = id(31);
const assignmentFirstPricing = id(40);
const assignmentFirstCompensation = id(41);
const termFirstPricing = id(42);
const termFirstCompensation = id(43);
const assignmentFirstEndOperation = id(50);
const termFirstEndOperation = id(51);
const ownerMarkerEntity = id(60);
const ownerMarkerOperation = id(61);
const fixtureIds = [
  admin,
  assignmentFirstPro,
  termFirstPro,
  assignmentFirstTenant,
  termFirstTenant,
  assignmentFirstCompany,
  termFirstCompany,
  assignmentFirstCredential,
  termFirstCredential,
  assignmentFirstPricing,
  assignmentFirstCompensation,
  termFirstPricing,
  termFirstCompensation,
  assignmentFirstEndOperation,
  termFirstEndOperation,
  ownerMarkerEntity,
  ownerMarkerOperation,
];

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const quotedFixtureIds = fixtureIds.map(sqlLiteral).join(',');
const proIds = [assignmentFirstPro, termFirstPro];
const tenantIds = [assignmentFirstTenant, termFirstTenant];
const companyIds = [assignmentFirstCompany, termFirstCompany];
const credentialIds = [assignmentFirstCredential, termFirstCredential];
const termIds = [
  assignmentFirstPricing,
  assignmentFirstCompensation,
  termFirstPricing,
  termFirstCompensation,
];

const cleanupOwnerToken = process.env.P303_COMBINED_ASSIGNMENT_TERM_CLEANUP_OWNER_TOKEN;
if (cleanupOwnerToken !== undefined) {
  assert.match(
    cleanupOwnerToken,
    /^[a-f0-9]{12}$/u,
    'Cleanup owner token must be 12 lowercase hex characters',
  );
}
const runToken = cleanupOwnerToken ?? randomUUID().replaceAll('-', '').slice(0, 12);
const simulateSetupAmbiguity =
  process.env.P303_COMBINED_ASSIGNMENT_TERM_SIMULATE_SETUP_AMBIGUITY === '1';
const simulateLockAcquireTimeout =
  process.env.P303_COMBINED_ASSIGNMENT_TERM_SIMULATE_LOCK_ACQUIRE_TIMEOUT === '1';
const MAX_WORKER_OUTPUT = 16_384;
const SERVER_PGOPTIONS = [
  '-c statement_timeout=20s',
  '-c lock_timeout=5s',
  '-c idle_in_transaction_session_timeout=20s',
  '-c idle_session_timeout=120s',
].join(' ');
const dockerArgs = [
  'exec',
  '-i',
  '-e',
  `PGOPTIONS=${SERVER_PGOPTIONS}`,
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

function redact(value) {
  return String(value)
    .replaceAll(/[a-z0-9._%+-]+@example[.]invalid/giu, '[REDACTED_EMAIL]')
    .replaceAll(/[a-f0-9]{64}/giu, '[REDACTED_HASH]');
}

function terminateBackend(pid) {
  if (!Number.isInteger(pid)) return;
  spawnSync('docker', dockerArgs, {
    input: `select pg_catalog.pg_cancel_backend(${pid}); select pg_catalog.pg_terminate_backend(${pid});`,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function sql(input) {
  const result = spawnSync('docker', dockerArgs, {
    input: `select 'P303_SYNC_PID=' || pg_catalog.pg_backend_pid();\n${input}`,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.error?.code === 'ETIMEDOUT') {
    const match = String(result.stdout).match(/P303_SYNC_PID=(\d+)/u);
    terminateBackend(match ? Number(match[1]) : undefined);
  }
  assert.equal(
    result.status,
    0,
    redact(result.stderr || result.stdout).slice(0, MAX_WORKER_OUTPUT),
  );
  return result.stdout
    .split('\n')
    .filter((line) => !line.startsWith('P303_SYNC_PID='))
    .join('\n')
    .trim();
}

function worker(input, { endInput = true, timeoutMs = 20_000 } = {}) {
  const child = spawn('docker', dockerArgs);
  let output = '';
  let parsingBuffer = '';
  let backendPidValue;
  let processError;
  let timedOut = false;
  let settled = false;
  const watchers = [];
  let resolvePid;
  const backendPid = new Promise((resolve) => {
    resolvePid = resolve;
  });
  const append = (chunk) => {
    const raw = String(chunk);
    parsingBuffer = `${parsingBuffer}${raw}`.slice(-4096);
    const match = parsingBuffer.match(/P303_BACKEND_PID=(\d+)/u);
    if (match && backendPidValue === undefined) {
      backendPidValue = Number(match[1]);
      resolvePid(backendPidValue);
    }
    const safe = redact(raw);
    if (output.length < MAX_WORKER_OUTPUT) {
      output += safe.slice(0, MAX_WORKER_OUTPUT - output.length);
    }
    for (const watcher of watchers) {
      if (!watcher.done && parsingBuffer.includes(watcher.marker)) {
        watcher.done = true;
        watcher.resolve();
      }
    }
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  let timer;
  const completion = new Promise((resolve, reject) => {
    child.on('error', (error) => {
      processError = error;
      child.kill();
    });
    child.on('close', (exit) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (backendPidValue === undefined) resolvePid(undefined);
      if (timedOut) reject(new Error(`Worker exceeded ${timeoutMs}ms:\n${output}`));
      else if (processError) reject(processError);
      else resolve({ exit, output });
    });
  });
  if (timeoutMs !== null) {
    timer = setTimeout(() => {
      timedOut = true;
      terminateBackend(backendPidValue);
      child.kill();
    }, timeoutMs);
  }

  child.stdin.write(
    `\\pset tuples_only on\n\\pset format unaligned\nselect 'P303_BACKEND_PID=' || pg_catalog.pg_backend_pid();\n${input}\n`,
  );
  if (endInput) child.stdin.end();
  return {
    child,
    completion,
    backendPid,
    getBackendPid: () => backendPidValue,
    getOutput: () => output,
    isSettled: () => settled,
    waitForOutput(marker) {
      if (parsingBuffer.includes(marker)) return Promise.resolve();
      const markerSeen = new Promise((resolve) => watchers.push({ marker, resolve, done: false }));
      return Promise.race([
        markerSeen,
        completion.then(() => {
          throw new Error(`Worker closed before marker ${marker}:\n${output}`);
        }),
      ]);
    },
  };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const HARNESS_LOCK_KEY = 953300303;
const LOCK_ACQUIRE_READY_TIMEOUT_MS = 10_000;
const LOCK_RELEASE_CLOSE_TIMEOUT_MS = 10_000;

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
}

function verifyAndTerminateLockBackend(pid, applicationName) {
  if (!Number.isInteger(pid)) return false;
  const result = spawnSync('docker', dockerArgs, {
    input: `select coalesce((select pg_catalog.pg_terminate_backend(pid)
      from pg_catalog.pg_stat_activity
      where pid=${pid} and application_name=${sqlLiteral(applicationName)}),false);`,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(
    result.status,
    0,
    `Exact lock-backend termination check failed: ${redact(result.stderr || result.stdout).slice(0, MAX_WORKER_OUTPUT)}`,
  );
  return result.stdout.trim() === 't';
}

function terminateTimedOutLockSession(session, pid, applicationName, phaseError) {
  try {
    verifyAndTerminateLockBackend(pid, applicationName);
  } catch (verificationError) {
    throw new AggregateError(
      [phaseError, verificationError],
      'Lock phase failed and exact backend verification/termination also failed',
    );
  } finally {
    session.child.kill();
  }
  throw phaseError;
}

async function acquireHarnessLock() {
  const applicationName = `p303-${runToken}-assignment-term-lock`;
  const acquireReadyMarker = simulateLockAcquireTimeout
    ? 'P303_SIMULATED_READY_NEVER'
    : 'P303_LOCK=';
  const session = worker(
    `set application_name=${sqlLiteral(applicationName)};
     set idle_session_timeout='0';
     set idle_in_transaction_session_timeout='0';
     select 'P303_LOCK=' || pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`,
    { endInput: false, timeoutMs: null },
  );
  let backendPid;
  try {
    [backendPid] = await withTimeout(
      Promise.all([session.backendPid, session.waitForOutput(acquireReadyMarker)]),
      LOCK_ACQUIRE_READY_TIMEOUT_MS,
      'Harness lock acquire-ready phase',
    );
  } catch (error) {
    terminateTimedOutLockSession(session, session.getBackendPid(), applicationName, error);
  }
  assert.equal(Number.isInteger(backendPid), true, 'Harness lock backend PID was not captured');
  if (!session.getOutput().includes('P303_LOCK=t')) {
    session.child.stdin.write(`rollback;\n`);
    session.child.stdin.end('\\q\n');
    try {
      await withTimeout(
        session.completion,
        LOCK_RELEASE_CLOSE_TIMEOUT_MS,
        'Unowned harness lock close phase',
      );
    } catch (error) {
      if (!session.isSettled()) {
        terminateTimedOutLockSession(session, backendPid, applicationName, error);
      }
      throw error;
    }
    throw new Error('Another P3.03 assignment/term race harness owns the fixture lock');
  }
  return {
    async release() {
      session.child.stdin.write(`rollback;\n`);
      session.child.stdin.write(
        `select 'P303_UNLOCK=' || pg_catalog.pg_advisory_unlock(${HARNESS_LOCK_KEY});\n`,
      );
      session.child.stdin.end('\\q\n');
      try {
        const result = await withTimeout(
          session.completion,
          LOCK_RELEASE_CLOSE_TIMEOUT_MS,
          'Harness lock release-close phase',
        );
        assert.equal(result.exit, 0, `Harness lock release failed:\n${result.output}`);
        assert.match(result.output, /P303_UNLOCK=t/u, 'Harness advisory unlock was not confirmed');
      } catch (error) {
        if (!session.isSettled()) {
          terminateTimedOutLockSession(session, backendPid, applicationName, error);
        }
        throw error;
      }
    },
  };
}

async function contend(label, first, second, expectedSecondError = null) {
  const suffix = label.replaceAll(/[^a-z0-9]/giu, '-').slice(0, 28);
  const appA = `p303-${runToken}-${suffix}-a`;
  const appB = `p303-${runToken}-${suffix}-b`;
  const sessionA = worker(
    `set application_name=${sqlLiteral(appA)}; begin; set local statement_timeout='12s';
     ${first}
     select 'P303_A_RPC_DONE'; select pg_catalog.pg_sleep(3); commit;`,
  );
  const aPid = await sessionA.backendPid;
  assert.equal(Number.isInteger(aPid), true, `${label}: A backend PID was not captured`);
  await sessionA.waitForOutput('P303_A_RPC_DONE');

  const sessionB = worker(
    `\\set VERBOSITY verbose
     set application_name=${sqlLiteral(appB)}; begin; set local statement_timeout='12s';
     ${second}
     commit;`,
  );
  const bPid = await sessionB.backendPid;
  assert.equal(Number.isInteger(bPid), true, `${label}: B backend PID was not captured`);
  let blocked = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    blocked =
      sql(`select exists(
        select 1 from pg_catalog.pg_stat_activity a
        cross join pg_catalog.pg_stat_activity b
        where a.pid=${aPid} and b.pid=${bPid}
          and a.application_name=${sqlLiteral(appA)}
          and b.application_name=${sqlLiteral(appB)}
          and a.pid=any(pg_catalog.pg_blocking_pids(b.pid))
      );`) === 't';
    if (blocked) break;
    await wait(50);
  }

  const [a, b] = await Promise.all([sessionA.completion, sessionB.completion]);
  assert.equal(a.exit, 0, `${label}: first RPC failed\n${a.output}`);
  assert.equal(
    blocked,
    true,
    `${label}: exact PID-specific blocking was not observed\n${b.output}`,
  );
  if (expectedSecondError === null) {
    assert.equal(b.exit, 0, `${label}: valid sequential follower failed\n${b.output}`);
  } else {
    assert.notEqual(b.exit, 0, `${label}: losing RPC unexpectedly committed`);
    assert.match(b.output, expectedSecondError, `${label}: unexpected losing error`);
  }
  console.log(`PASS ${label}: exact PIDs blocked and serialized`);
  return { first: a.output, second: b.output };
}

function assignmentPredicate() {
  return `(company_id in (${companyIds.map(sqlLiteral).join(',')})
    or pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))`;
}

function termPredicate() {
  return `(id in (${termIds.map(sqlLiteral).join(',')})
    or pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))`;
}

function termEventPredicate() {
  return `(commercial_term_id in (${termIds.map(sqlLiteral).join(',')})
    or pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))`;
}

function tenantAuditPredicate() {
  return `(tenant_id in (${tenantIds.map(sqlLiteral).join(',')})
    or details ->> 'company_id' in (${companyIds.map(sqlLiteral).join(',')})
    or details ->> 'pro_profile_id' in (${proIds.map(sqlLiteral).join(',')}))`;
}

function authEventPredicate() {
  return `(actor_user_id in (${quotedFixtureIds})
    or details ->> 'targetProProfileId' in (${proIds.map(sqlLiteral).join(',')})
    or details ->> 'entityId' in (${termIds.map(sqlLiteral).join(',')}))`;
}

function receiptPredicate() {
  return `(entity_id in (${quotedFixtureIds})
    or operation_id in (${quotedFixtureIds}))`;
}

function eventPredicate() {
  return `(payload ->> 'resource_id' in (${termIds.map(sqlLiteral).join(',')})
    or payload ->> 'subject_id' in (${proIds.map(sqlLiteral).join(',')}))`;
}

const CLEANUP_TRIGGERS = [
  {
    table: 'event_job_attempts',
    trigger: 'event_job_attempts_immutable',
  },
  {
    table: 'event_replay_requests',
    trigger: 'event_replay_requests_immutable',
  },
  { table: 'domain_events', trigger: 'domain_events_immutable' },
];

function snapshotCleanupTriggerStates() {
  const rows = sql(`select table_name || '|' || trigger_name || '|' || tgenabled::text
    from (values
      ('event_job_attempts','event_job_attempts_immutable'),
      ('event_replay_requests','event_replay_requests_immutable'),
      ('domain_events','domain_events_immutable')
    ) expected(table_name,trigger_name)
    join pg_catalog.pg_class relation on relation.relname=expected.table_name
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      and namespace.nspname='public'
    join pg_catalog.pg_trigger trigger on trigger.tgrelid=relation.oid
      and trigger.tgname=expected.trigger_name
      and not trigger.tgisinternal
    order by table_name,trigger_name;`);
  return rows.split('\n').filter(Boolean);
}

function assertExpectedCleanupTriggerStates(states) {
  assert.deepEqual(
    states,
    [
      'domain_events|domain_events_immutable|O',
      'event_job_attempts|event_job_attempts_immutable|O',
      'event_replay_requests|event_replay_requests_immutable|O',
    ],
    'Cleanup triggers are not in the required enabled preflight state',
  );
}

function restoreCleanupTriggerSql(states) {
  assert.equal(states.length, CLEANUP_TRIGGERS.length, 'Cleanup trigger snapshot is incomplete');
  const stateByIdentity = new Map(
    states.map((row) => {
      const [table, trigger, state] = row.split('|');
      return [`${table}|${trigger}`, state];
    }),
  );
  const stateCommands = new Map([
    ['O', 'enable trigger'],
    ['D', 'disable trigger'],
    ['A', 'enable always trigger'],
    ['R', 'enable replica trigger'],
  ]);
  return CLEANUP_TRIGGERS.map(({ table, trigger }) => {
    const state = stateByIdentity.get(`${table}|${trigger}`);
    const command = stateCommands.get(state);
    assert.ok(command, `Unsupported cleanup trigger state ${state}`);
    return `alter table public.${table} ${command} ${trigger};`;
  }).join('\n');
}

function assertCleanupTriggerStates(expected, message) {
  assert.deepEqual(snapshotCleanupTriggerStates(), expected, message);
}

function cleanup(cleanupTriggerStates) {
  sql(`begin;
    set local statement_timeout='20s';
    do $ownership$
    declare v_token text;
    begin
      select sanitized_result ->> 'runToken' into v_token
      from public.pro_lifecycle_operation_receipts
      where entity_id=${sqlLiteral(ownerMarkerEntity)}
        and operation_id=${sqlLiteral(ownerMarkerOperation)}
      for update;
      if v_token is distinct from ${sqlLiteral(runToken)} then
        raise exception 'CLEANUP_OWNERSHIP_MISMATCH';
      end if;
    end
    $ownership$;
    alter table public.event_job_attempts disable trigger event_job_attempts_immutable;
    alter table public.event_replay_requests disable trigger event_replay_requests_immutable;
    alter table public.domain_events disable trigger domain_events_immutable;
    update public.event_jobs set replay_request_id=null
      where event_id in (select id from public.domain_events where ${eventPredicate()});
    delete from public.event_job_attempts where job_id in
      (select id from public.event_jobs where event_id in
        (select id from public.domain_events where ${eventPredicate()}));
    delete from public.event_replay_requests where source_job_id in
      (select id from public.event_jobs where event_id in
        (select id from public.domain_events where ${eventPredicate()}))
      or replay_job_id in
      (select id from public.event_jobs where event_id in
        (select id from public.domain_events where ${eventPredicate()}));
    delete from public.event_jobs where event_id in
      (select id from public.domain_events where ${eventPredicate()});
    delete from public.domain_events where ${eventPredicate()};
    ${restoreCleanupTriggerSql(cleanupTriggerStates)}
    delete from public.auth_events where ${authEventPredicate()};
    delete from public.pro_lifecycle_operation_receipts where ${receiptPredicate()};
    delete from public.pro_commercial_term_events where ${termEventPredicate()};
    delete from public.pro_assignment_term_links where assignment_id in
      (select id from public.pro_company_assignments where ${assignmentPredicate()});
    delete from public.tenant_audit_log where ${tenantAuditPredicate()};
    delete from public.pro_company_assignments where ${assignmentPredicate()};
    delete from public.pro_credentials
      where id in (${credentialIds.map(sqlLiteral).join(',')})
         or pro_profile_id in (${proIds.map(sqlLiteral).join(',')});
    delete from public.pro_commercial_terms where ${termPredicate()};
    delete from public.company_profiles where id in (${companyIds.map(sqlLiteral).join(',')});
    delete from public.pro_profiles where profile_id in (${proIds.map(sqlLiteral).join(',')});
    delete from public.profiles where id in (${quotedFixtureIds});
    delete from public.tenants where id in (${tenantIds.map(sqlLiteral).join(',')});
    delete from auth.users where id in (${quotedFixtureIds});
    commit;`);
}

function fixtureCount() {
  return sql(`select
    (select count(*) from auth.users where id in (${quotedFixtureIds})) +
    (select count(*) from public.profiles where id in (${quotedFixtureIds})) +
    (select count(*) from public.pro_profiles where profile_id in (${proIds.map(sqlLiteral).join(',')})) +
    (select count(*) from public.tenants where id in (${tenantIds.map(sqlLiteral).join(',')})) +
    (select count(*) from public.company_profiles where id in (${companyIds.map(sqlLiteral).join(',')})) +
    (select count(*) from public.pro_credentials where id in (${credentialIds.map(sqlLiteral).join(',')}) or pro_profile_id in (${proIds.map(sqlLiteral).join(',')})) +
    (select count(*) from public.pro_commercial_terms where ${termPredicate()}) +
    (select count(*) from public.pro_commercial_term_events where ${termEventPredicate()}) +
    (select count(*) from public.pro_company_assignments where ${assignmentPredicate()}) +
    (select count(*) from public.tenant_audit_log where ${tenantAuditPredicate()}) +
    (select count(*) from public.auth_events where ${authEventPredicate()}) +
    (select count(*) from public.pro_lifecycle_operation_receipts where ${receiptPredicate()}) +
    (select count(*) from public.domain_events where ${eventPredicate()}) +
    (select count(*) from public.event_jobs where event_id in
      (select id from public.domain_events where ${eventPredicate()}));`);
}

function assignRpc(companyId, proId) {
  return `select public.assign_pro_to_company(
    ${sqlLiteral(companyId)},${sqlLiteral(proId)},${sqlLiteral(admin)}
  );`;
}

function endTermRpc(termId, operationId, hashCharacter) {
  return `select public.end_pro_commercial_term(
    ${sqlLiteral(admin)},${sqlLiteral(termId)},1,${sqlLiteral(operationId)},
    repeat(${sqlLiteral(hashCharacter)},64),
    pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date
  );`;
}

function setup() {
  sql(`begin;
    with chronology as (
      select pg_catalog.now()-interval '60 minutes' as users_at,
        pg_catalog.now()-interval '59 minutes' as roots_at,
        pg_catalog.now()-interval '58 minutes' as children_at,
        pg_catalog.now()-interval '57 minutes' as credentials_at,
        pg_catalog.now()-interval '56 minutes' as terms_at
    )
    insert into auth.users(
      id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at
    )
    select fixture.id,'00000000-0000-0000-0000-000000000000','authenticated',
      'authenticated',fixture.email,'',chronology.users_at,'{}','{}',
      chronology.users_at,chronology.users_at
    from chronology cross join (values
      (${sqlLiteral(admin)}::uuid,'assignment-term-admin@example.invalid'),
      (${sqlLiteral(assignmentFirstPro)}::uuid,'assignment-first-pro@example.invalid'),
      (${sqlLiteral(termFirstPro)}::uuid,'term-first-pro@example.invalid')
    ) fixture(id,email);
    with chronology as (select pg_catalog.now()-interval '59 minutes' as roots_at)
    insert into public.profiles(id,role,status,full_name,created_at,updated_at)
    select fixture.id,fixture.role::public.app_role,'active',fixture.full_name,
      chronology.roots_at,chronology.roots_at
    from chronology cross join (values
      (${sqlLiteral(admin)}::uuid,'super_admin','Assignment Term Admin'),
      (${sqlLiteral(assignmentFirstPro)}::uuid,'pro','Assignment First PRO'),
      (${sqlLiteral(termFirstPro)}::uuid,'pro','Term First PRO')
    ) fixture(id,role,full_name);
    with chronology as (select pg_catalog.now()-interval '59 minutes' as roots_at)
    insert into public.tenants(id,name,slug,plan,status,created_at,updated_at) values
      (${sqlLiteral(assignmentFirstTenant)},'Assignment First Tenant','p303-assignment-first','starter','pending',
        (select roots_at from chronology),(select roots_at from chronology)),
      (${sqlLiteral(termFirstTenant)},'Term First Tenant','p303-term-first','starter','pending',
        (select roots_at from chronology),(select roots_at from chronology));
    with chronology as (select pg_catalog.now()-interval '58 minutes' as children_at)
    insert into public.pro_profiles(profile_id,created_at,updated_at) values
      (${sqlLiteral(assignmentFirstPro)},(select children_at from chronology),(select children_at from chronology)),
      (${sqlLiteral(termFirstPro)},(select children_at from chronology),(select children_at from chronology));
    with chronology as (select pg_catalog.now()-interval '58 minutes' as children_at)
    insert into public.company_profiles(
      id,tenant_id,company_name,status,created_at,updated_at
    ) values
      (${sqlLiteral(assignmentFirstCompany)},${sqlLiteral(assignmentFirstTenant)},
        'Assignment First LLC','onboarding',(select children_at from chronology),(select children_at from chronology)),
      (${sqlLiteral(termFirstCompany)},${sqlLiteral(termFirstTenant)},
        'Term First LLC','onboarding',(select children_at from chronology),(select children_at from chronology));
    with chronology as (select pg_catalog.now()-interval '57 minutes' as credentials_at)
    insert into public.pro_credentials(
      id,pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,
      issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by,
      created_at,updated_at
    ) values
      (${sqlLiteral(assignmentFirstCredential)},${sqlLiteral(assignmentFirstPro)},'synthetic',repeat('1',64),'3301',
        'Synthetic Authority',current_date-30,current_date+365,'verified',1,
        (select credentials_at from chronology),${sqlLiteral(admin)},
        (select credentials_at from chronology),(select credentials_at from chronology)),
      (${sqlLiteral(termFirstCredential)},${sqlLiteral(termFirstPro)},'synthetic',repeat('2',64),'3302',
        'Synthetic Authority',current_date-30,current_date+365,'verified',1,
        (select credentials_at from chronology),${sqlLiteral(admin)},
        (select credentials_at from chronology),(select credentials_at from chronology));
    with chronology as (select pg_catalog.now()-interval '56 minutes' as terms_at)
    insert into public.pro_commercial_terms(
      id,pro_profile_id,term_kind,model,amount_minor,effective_from,status,version,
      created_by,created_at,updated_at
    ) values
      (${sqlLiteral(assignmentFirstPricing)},${sqlLiteral(assignmentFirstPro)},'pricing','per_registration',10000,current_date-1,'active',1,${sqlLiteral(admin)},(select terms_at from chronology),(select terms_at from chronology)),
      (${sqlLiteral(assignmentFirstCompensation)},${sqlLiteral(assignmentFirstPro)},'compensation','per_registration',10000,current_date-1,'active',1,${sqlLiteral(admin)},(select terms_at from chronology),(select terms_at from chronology)),
      (${sqlLiteral(termFirstPricing)},${sqlLiteral(termFirstPro)},'pricing','per_registration',10000,current_date-1,'active',1,${sqlLiteral(admin)},(select terms_at from chronology),(select terms_at from chronology)),
      (${sqlLiteral(termFirstCompensation)},${sqlLiteral(termFirstPro)},'compensation','per_registration',10000,current_date-1,'active',1,${sqlLiteral(admin)},(select terms_at from chronology),(select terms_at from chronology));
    insert into public.pro_lifecycle_operation_receipts(
      entity_kind,entity_id,operation_id,payload_hash,sanitized_result
    ) values(
      'commercial_term',${sqlLiteral(ownerMarkerEntity)},${sqlLiteral(ownerMarkerOperation)},
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${sqlLiteral(runToken)},'UTF8')),'hex'),
      pg_catalog.jsonb_build_object('harness','p303-assignment-commercial-term-race','runToken',${sqlLiteral(runToken)})
    );
    commit;`);
  if (simulateSetupAmbiguity) {
    throw new Error('SIMULATED_SETUP_COMMIT_AMBIGUITY');
  }
}

function ownershipMarkerMatches() {
  return (
    sql(`select exists(select 1 from public.pro_lifecycle_operation_receipts
      where entity_id=${sqlLiteral(ownerMarkerEntity)}
        and operation_id=${sqlLiteral(ownerMarkerOperation)}
        and sanitized_result ->> 'runToken'=${sqlLiteral(runToken)});`) === 't'
  );
}

function assertOwnershipMarker() {
  assert.equal(
    ownershipMarkerMatches(),
    true,
    'Durable run-token ownership marker was not committed',
  );
}

function printRecoveryInstructions() {
  console.error(`P303_ASSIGNMENT_TERM_RECOVERY_OWNER_TOKEN=${runToken}`);
  console.error(
    `RECOVERY: P303_COMBINED_DB_CONTAINER=${expectedContainer} P303_COMBINED_ASSIGNMENT_TERM_CLEANUP_OWNER_TOKEN=${runToken} node supabase/tests/p303-combined-assignment-commercial-term-race.mjs`,
  );
}

function assertFixturePreflight() {
  assert.equal(
    sql(`select count(*) from (values
      (${sqlLiteral(assignmentFirstPro)}::uuid,${sqlLiteral(assignmentFirstTenant)}::uuid,${sqlLiteral(assignmentFirstCompany)}::uuid,${sqlLiteral(assignmentFirstCredential)}::uuid,${sqlLiteral(assignmentFirstPricing)}::uuid,${sqlLiteral(assignmentFirstCompensation)}::uuid),
      (${sqlLiteral(termFirstPro)}::uuid,${sqlLiteral(termFirstTenant)}::uuid,${sqlLiteral(termFirstCompany)}::uuid,${sqlLiteral(termFirstCredential)}::uuid,${sqlLiteral(termFirstPricing)}::uuid,${sqlLiteral(termFirstCompensation)}::uuid)
    ) fixture(pro_id,tenant_id,company_id,credential_id,pricing_id,compensation_id)
    join auth.users actor_user on actor_user.id=${sqlLiteral(admin)}
    join public.profiles actor on actor.id=actor_user.id
    join auth.users pro_user on pro_user.id=fixture.pro_id
    join public.profiles profile on profile.id=pro_user.id
    join public.pro_profiles pro on pro.profile_id=profile.id
    join public.pro_credentials credential on credential.id=fixture.credential_id
      and credential.pro_profile_id=profile.id
    join public.pro_commercial_terms pricing on pricing.id=fixture.pricing_id
      and pricing.pro_profile_id=profile.id
    join public.pro_commercial_terms compensation on compensation.id=fixture.compensation_id
      and compensation.pro_profile_id=profile.id
    join public.tenants tenant on tenant.id=fixture.tenant_id
    join public.company_profiles company on company.id=fixture.company_id
      and company.tenant_id=tenant.id
    where actor_user.created_at < actor.created_at
      and pro_user.created_at < profile.created_at
      and profile.created_at < pro.created_at
      and pro.created_at < credential.created_at
      and credential.created_at < pricing.created_at
      and credential.created_at < compensation.created_at
      and tenant.created_at < company.created_at;`),
    '2',
    'Full parent-child fixture chronology is inconsistent',
  );

  const legalState = (proId, tenantId, companyId, credentialId, pricingId, compensationId) =>
    sql(`select
      actor.role || '|' || actor.status || '|' || coalesce(actor.tenant_id::text,'null') || '|' ||
      profile.role || '|' || profile.status || '|' || coalesce(profile.tenant_id::text,'null') || '|' ||
      credential.state || '|' || credential.credential_type || '|' ||
      pricing.term_kind || '|' || pricing.status || '|' || pricing.version || '|' ||
      compensation.term_kind || '|' || compensation.status || '|' || compensation.version || '|' ||
      tenant.status || '|' || company.status || '|' ||
      (not exists(select 1 from public.pro_company_assignments assignment
        where assignment.status='active'
          and (assignment.pro_profile_id=profile.id or assignment.company_id=company.id)))::text || '|' ||
      (pricing.effective_from <= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date
        and (pricing.effective_to is null or pricing.effective_to >= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date))::text || '|' ||
      (compensation.effective_from <= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date
        and (compensation.effective_to is null or compensation.effective_to >= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date))::text || '|' ||
      (pricing.effective_from <= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date)::text
    from public.profiles actor
    cross join public.profiles profile
    join public.pro_credentials credential on credential.id=${sqlLiteral(credentialId)}
      and credential.pro_profile_id=profile.id
      and credential.expiry_date >= pg_catalog.timezone('Asia/Dubai',pg_catalog.now())::date
    join public.pro_commercial_terms pricing on pricing.id=${sqlLiteral(pricingId)}
      and pricing.pro_profile_id=profile.id
    join public.pro_commercial_terms compensation on compensation.id=${sqlLiteral(compensationId)}
      and compensation.pro_profile_id=profile.id
    join public.tenants tenant on tenant.id=${sqlLiteral(tenantId)}
    join public.company_profiles company on company.id=${sqlLiteral(companyId)}
      and company.tenant_id=tenant.id
    where actor.id=${sqlLiteral(admin)} and profile.id=${sqlLiteral(proId)};`);
  const expected =
    'super_admin|active|null|pro|active|null|verified|pro_license|pricing|active|1|compensation|active|1|pending|onboarding|true|true|true|true';
  const assignmentFirstLegalState = legalState(
    assignmentFirstPro,
    assignmentFirstTenant,
    assignmentFirstCompany,
    assignmentFirstCredential,
    assignmentFirstPricing,
    assignmentFirstCompensation,
  );
  const termFirstLegalState = legalState(
    termFirstPro,
    termFirstTenant,
    termFirstCompany,
    termFirstCredential,
    termFirstPricing,
    termFirstCompensation,
  );
  assert.equal(
    assignmentFirstLegalState,
    expected,
    'Assignment-first schedule is not fully legal before contention',
  );
  assert.equal(
    termFirstLegalState,
    expected,
    'Term-first schedule is not fully legal before contention',
  );
  assert.deepEqual(
    [assignmentFirstLegalState, termFirstLegalState],
    [expected, expected],
    'Both schedules are not fully legal before contention',
  );
  assert.equal(
    sql(`select count(*) from public.pro_commercial_terms term
      join public.profiles profile on profile.id=term.pro_profile_id
      join public.pro_credentials credential on credential.pro_profile_id=profile.id
      where (term.id in (${termIds.map(sqlLiteral).join(',')})
          or term.pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))
        and profile.created_at < credential.created_at
        and credential.created_at < term.created_at
        and term.created_at = term.updated_at;`),
    '4',
    'Term fixture chronology changed',
  );
}

const jsonResult = (output) => JSON.parse(output.split('\n').find((line) => line.startsWith('{')));
const sqlJson = (input) => JSON.parse(sql(input));

function finalState(proId, tenantId, companyId, pricingId, compensationId) {
  return sqlJson(`select pg_catalog.jsonb_build_object(
    'profile',pg_catalog.jsonb_build_object(
      'role',profile.role,'status',profile.status,'tenantId',profile.tenant_id,
      'authTenantId',pro_user.raw_app_meta_data ->> 'tenant_id'),
    'tenant',pg_catalog.jsonb_build_object('id',tenant.id,'status',tenant.status),
    'company',pg_catalog.jsonb_build_object(
      'id',company.id,'tenantId',company.tenant_id,'status',company.status),
    'pricing',pg_catalog.jsonb_build_object(
      'id',pricing.id,'status',pricing.status,'version',pricing.version,
      'effectiveTo',pricing.effective_to),
    'compensation',pg_catalog.jsonb_build_object(
      'id',compensation.id,'status',compensation.status,'version',compensation.version,
      'effectiveTo',compensation.effective_to),
    'assignment',(select pg_catalog.jsonb_build_object(
      'id',assignment.id,'status',assignment.status,'tenantId',assignment.tenant_id,
      'companyId',assignment.company_id,'proProfileId',assignment.pro_profile_id)
      from public.pro_company_assignments assignment
      where assignment.company_id=company.id)
  )
  from public.profiles profile
  join auth.users pro_user on pro_user.id=profile.id
  cross join public.tenants tenant
  join public.company_profiles company on company.id=${sqlLiteral(companyId)}
    and company.tenant_id=tenant.id
  cross join public.pro_commercial_terms pricing
  cross join public.pro_commercial_terms compensation
  where profile.id=${sqlLiteral(proId)} and tenant.id=${sqlLiteral(tenantId)}
    and pricing.id=${sqlLiteral(pricingId)}
    and compensation.id=${sqlLiteral(compensationId)};`);
}

function assignmentAudit(tenantId, assignmentId, companyId, proId) {
  return sqlJson(`select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'actorId',audit.actor_id,'action',audit.action,'source',audit.source,
    'details',audit.details) order by audit.id),'[]'::jsonb)
  from public.tenant_audit_log audit
  where audit.tenant_id=${sqlLiteral(tenantId)}
    and audit.actor_id=${sqlLiteral(admin)}
    and audit.action='company_pro_assigned'
    and audit.source='admin'
    and audit.details=pg_catalog.jsonb_build_object(
      'assignment_id',${sqlLiteral(assignmentId)}::uuid,
      'company_id',${sqlLiteral(companyId)}::uuid,
      'pro_profile_id',${sqlLiteral(proId)}::uuid);`);
}

function termSideEffects(proId, pricingId, operationId, hashCharacter) {
  const expectedResultSql = `pg_catalog.jsonb_build_object(
    'termId',${sqlLiteral(pricingId)}::uuid,'termKind','pricing','status','ended',
    'effectiveTo',(select effective_to from public.pro_commercial_terms
      where id=${sqlLiteral(pricingId)}),'version',2)`;
  const expectedPayloadSql = `pg_catalog.jsonb_build_object(
    'subject_id',${sqlLiteral(proId)}::uuid,
    'resource_id',${sqlLiteral(pricingId)}::uuid,
    'operation_id',${sqlLiteral(operationId)}::uuid,
    'term_kind','pricing','version',2,'change','ended')`;
  return sqlJson(`select pg_catalog.jsonb_build_object(
    'termEvents',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'proProfileId',event.pro_profile_id,'termId',event.commercial_term_id,
      'event',event.event,'fromStatus',event.from_status,'toStatus',event.to_status,
      'actorId',event.actor_profile_id,'version',event.term_version) order by event.id)
      from public.pro_commercial_term_events event
      where event.commercial_term_id=${sqlLiteral(pricingId)}
        and event.pro_profile_id=${sqlLiteral(proId)}
        and event.event='ended' and event.from_status='active' and event.to_status='ended'
        and event.actor_profile_id=${sqlLiteral(admin)} and event.term_version=2),'[]'::jsonb),
    'authEvents',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'actorId',audit.actor_user_id,'tenantId',audit.tenant_id,'kind',audit.kind,
      'details',audit.details) order by audit.id)
      from public.auth_events audit
      where audit.actor_user_id=${sqlLiteral(admin)} and audit.tenant_id is null
        and audit.kind='pro_lifecycle_changed'
        and audit.details=pg_catalog.jsonb_build_object(
          'action','commercial_term_ended','targetProProfileId',${sqlLiteral(proId)}::uuid,
          'entityId',${sqlLiteral(pricingId)}::uuid,'version',2)),'[]'::jsonb),
    'receipts',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'entityKind',receipt.entity_kind,'entityId',receipt.entity_id,
      'operationId',receipt.operation_id,'payloadHash',receipt.payload_hash,
      'sanitizedResult',receipt.sanitized_result) order by receipt.operation_id)
      from public.pro_lifecycle_operation_receipts receipt
      where receipt.entity_kind='commercial_term'
        and receipt.entity_id=${sqlLiteral(pricingId)}
        and receipt.operation_id=${sqlLiteral(operationId)}
        and receipt.payload_hash=repeat(${sqlLiteral(hashCharacter)},64)
        and receipt.sanitized_result=${expectedResultSql}),'[]'::jsonb),
    'events',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'eventType',event.event_type,'eventVersion',event.event_version,
      'tenantId',event.tenant_id,'companyId',event.company_id,'actorId',event.actor_id,
      'privacyClass',event.privacy_class,'payload',event.payload) order by event.id)
      from public.domain_events event
      where event.event_type='pro.commercial_terms.changed' and event.event_version=1
        and event.tenant_id is null and event.company_id is null
        and event.actor_id=${sqlLiteral(admin)} and event.privacy_class='internal'
        and event.payload=${expectedPayloadSql}),'[]'::jsonb),
    'jobs',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'consumerName',job.consumer_name,'state',job.state) order by job.id)
      from public.event_jobs job join public.domain_events event on event.id=job.event_id
      where event.event_type='pro.commercial_terms.changed'
        and event.payload=${expectedPayloadSql}
        and job.consumer_name='internal.lifecycle.projection' and job.state='pending'),'[]'::jsonb)
  );`);
}

function expectedTermSideEffects(proId, pricingId, operationId, hashCharacter, businessDate) {
  const sanitizedResult = {
    termId: pricingId,
    termKind: 'pricing',
    status: 'ended',
    effectiveTo: businessDate,
    version: 2,
  };
  const payload = {
    subject_id: proId,
    resource_id: pricingId,
    operation_id: operationId,
    term_kind: 'pricing',
    version: 2,
    change: 'ended',
  };
  return {
    termEvents: [
      {
        proProfileId: proId,
        termId: pricingId,
        event: 'ended',
        fromStatus: 'active',
        toStatus: 'ended',
        actorId: admin,
        version: 2,
      },
    ],
    authEvents: [
      {
        actorId: admin,
        tenantId: null,
        kind: 'pro_lifecycle_changed',
        details: {
          action: 'commercial_term_ended',
          targetProProfileId: proId,
          entityId: pricingId,
          version: 2,
        },
      },
    ],
    receipts: [
      {
        entityKind: 'commercial_term',
        entityId: pricingId,
        operationId,
        payloadHash: hashCharacter.repeat(64),
        sanitizedResult,
      },
    ],
    events: [
      {
        eventType: 'pro.commercial_terms.changed',
        eventVersion: 1,
        tenantId: null,
        companyId: null,
        actorId: admin,
        privacyClass: 'internal',
        payload,
      },
    ],
    jobs: [{ consumerName: 'internal.lifecycle.projection', state: 'pending' }],
  };
}

function assertOneJobPerFixtureEvent() {
  assert.equal(
    sql(`select not exists(
      select event.id from public.domain_events event
      left join public.event_jobs job on job.event_id=event.id
      where ${eventPredicate()}
      group by event.id having count(job.id) <> 1
    );`),
    't',
    'P3.10 did not create exactly one job for every fixture event',
  );
}

async function runRaces() {
  const assignmentFirst = await contend(
    'assignment-wins-then-term-ends',
    assignRpc(assignmentFirstCompany, assignmentFirstPro),
    endTermRpc(assignmentFirstPricing, assignmentFirstEndOperation, '3'),
  );
  const assignmentFirstId = jsonResult(assignmentFirst.first).assignmentId;
  const assignmentFirstBusinessDate = jsonResult(assignmentFirst.second).effectiveTo;
  assert.deepEqual(
    finalState(
      assignmentFirstPro,
      assignmentFirstTenant,
      assignmentFirstCompany,
      assignmentFirstPricing,
      assignmentFirstCompensation,
    ),
    {
      profile: {
        role: 'pro',
        status: 'active',
        tenantId: assignmentFirstTenant,
        authTenantId: assignmentFirstTenant,
      },
      tenant: { id: assignmentFirstTenant, status: 'pending' },
      company: {
        id: assignmentFirstCompany,
        tenantId: assignmentFirstTenant,
        status: 'onboarding',
      },
      pricing: {
        id: assignmentFirstPricing,
        status: 'ended',
        version: 2,
        effectiveTo: assignmentFirstBusinessDate,
      },
      compensation: {
        id: assignmentFirstCompensation,
        status: 'active',
        version: 1,
        effectiveTo: null,
      },
      assignment: {
        id: assignmentFirstId,
        status: 'active',
        tenantId: assignmentFirstTenant,
        companyId: assignmentFirstCompany,
        proProfileId: assignmentFirstPro,
      },
    },
    'Full assignment-first final state changed',
  );
  assert.deepEqual(
    assignmentAudit(
      assignmentFirstTenant,
      assignmentFirstId,
      assignmentFirstCompany,
      assignmentFirstPro,
    ),
    [
      {
        actorId: admin,
        action: 'company_pro_assigned',
        source: 'admin',
        details: {
          assignment_id: assignmentFirstId,
          company_id: assignmentFirstCompany,
          pro_profile_id: assignmentFirstPro,
        },
      },
    ],
    'Assignment audit content changed',
  );
  assert.deepEqual(
    termSideEffects(assignmentFirstPro, assignmentFirstPricing, assignmentFirstEndOperation, '3'),
    expectedTermSideEffects(
      assignmentFirstPro,
      assignmentFirstPricing,
      assignmentFirstEndOperation,
      '3',
      assignmentFirstBusinessDate,
    ),
    'Commercial term side-effect content changed',
  );
  assert.equal(
    sql(`select assignment.status || '|' || term.status || '|' || term.version || '|' ||
      (link.pricing_term_id=${sqlLiteral(assignmentFirstPricing)}::uuid)::text || '|' ||
      (link.compensation_term_id=${sqlLiteral(assignmentFirstCompensation)}::uuid)::text
      from public.pro_company_assignments assignment
      join public.pro_assignment_term_links link on link.assignment_id=assignment.id
      join public.pro_commercial_terms term on term.id=link.pricing_term_id
      where assignment.company_id=${sqlLiteral(assignmentFirstCompany)};`),
    'active|ended|2|true|true',
    'active assignment snapshots the pricing term before its later end',
  );
  assert.equal(
    sql(`select
      (select count(*) from public.pro_company_assignments where company_id=${sqlLiteral(assignmentFirstCompany)}) || '|' ||
      (select count(*) from public.pro_assignment_term_links where assignment_id in
        (select id from public.pro_company_assignments where company_id=${sqlLiteral(assignmentFirstCompany)})) || '|' ||
      (select count(*) from public.tenant_audit_log where tenant_id=${sqlLiteral(assignmentFirstTenant)} and action='company_pro_assigned') || '|' ||
      (select count(*) from public.pro_commercial_term_events where commercial_term_id=${sqlLiteral(assignmentFirstPricing)} and event='ended') || '|' ||
      (select count(*) from public.auth_events where details ->> 'entityId'=${sqlLiteral(assignmentFirstPricing)} and details ->> 'action'='commercial_term_ended') || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(assignmentFirstPricing)} and operation_id=${sqlLiteral(assignmentFirstEndOperation)}) || '|' ||
      (select count(*) from public.domain_events where event_type='pro.commercial_terms.changed' and payload ->> 'resource_id'=${sqlLiteral(assignmentFirstPricing)});`),
    '1|1|1|1|1|1|1',
    'assignment-first schedule left assignment/term/event/audit/receipt fragments',
  );
  const assignmentFirstReplay = sql(
    endTermRpc(assignmentFirstPricing, assignmentFirstEndOperation, '3'),
  );
  assert.deepEqual(
    jsonResult(assignmentFirstReplay),
    jsonResult(assignmentFirst.second),
    'winner replay changed result',
  );

  const termFirst = await contend(
    'term-end-wins-assignment-rejected',
    endTermRpc(termFirstPricing, termFirstEndOperation, '4'),
    assignRpc(termFirstCompany, termFirstPro),
    /PRO_PRICING_NOT_CONFIGURED/u,
  );
  const termFirstBusinessDate = jsonResult(termFirst.first).effectiveTo;
  assert.deepEqual(
    finalState(
      termFirstPro,
      termFirstTenant,
      termFirstCompany,
      termFirstPricing,
      termFirstCompensation,
    ),
    {
      profile: { role: 'pro', status: 'active', tenantId: null, authTenantId: null },
      tenant: { id: termFirstTenant, status: 'pending' },
      company: {
        id: termFirstCompany,
        tenantId: termFirstTenant,
        status: 'onboarding',
      },
      pricing: {
        id: termFirstPricing,
        status: 'ended',
        version: 2,
        effectiveTo: termFirstBusinessDate,
      },
      compensation: {
        id: termFirstCompensation,
        status: 'active',
        version: 1,
        effectiveTo: null,
      },
      assignment: null,
    },
    'Full term-first final state changed',
  );
  assert.deepEqual(
    assignmentAudit(termFirstTenant, id(999), termFirstCompany, termFirstPro),
    [],
    'Rejected assignment audit content changed',
  );
  assert.deepEqual(
    termSideEffects(termFirstPro, termFirstPricing, termFirstEndOperation, '4'),
    expectedTermSideEffects(
      termFirstPro,
      termFirstPricing,
      termFirstEndOperation,
      '4',
      termFirstBusinessDate,
    ),
    'P3.10 event/job content changed',
  );
  assert.equal(
    sql(`select
      (select status || '|' || version from public.pro_commercial_terms where id=${sqlLiteral(termFirstPricing)}) || '|' ||
      (select count(*) from public.pro_company_assignments where company_id=${sqlLiteral(termFirstCompany)}) || '|' ||
      (select count(*) from public.pro_assignment_term_links where assignment_id in
        (select id from public.pro_company_assignments where company_id=${sqlLiteral(termFirstCompany)})) || '|' ||
      (select count(*) from public.tenant_audit_log where tenant_id=${sqlLiteral(termFirstTenant)} and action='company_pro_assigned');`),
    'ended|2|0|0|0',
    'end-first assignment loser left no assignment/audit fragments',
  );
  assert.equal(
    sql(`select
      (select count(*) from public.pro_commercial_term_events where commercial_term_id=${sqlLiteral(termFirstPricing)} and event='ended') || '|' ||
      (select count(*) from public.auth_events where details ->> 'entityId'=${sqlLiteral(termFirstPricing)} and details ->> 'action'='commercial_term_ended') || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(termFirstPricing)} and operation_id=${sqlLiteral(termFirstEndOperation)}) || '|' ||
      (select count(*) from public.domain_events where event_type='pro.commercial_terms.changed' and payload ->> 'resource_id'=${sqlLiteral(termFirstPricing)});`),
    '1|1|1|1',
    'term-first winner left partial term event/audit/receipt/domain-event fragments',
  );
  const termFirstReplay = sql(endTermRpc(termFirstPricing, termFirstEndOperation, '4'));
  assert.deepEqual(
    jsonResult(termFirstReplay),
    jsonResult(termFirst.first),
    'winner replay changed result',
  );

  assert.equal(
    sql(`select
      (select count(*) from public.pro_company_assignments where ${assignmentPredicate()}) || '|' ||
      (select count(*) from public.pro_assignment_term_links where assignment_id in
        (select id from public.pro_company_assignments where ${assignmentPredicate()})) || '|' ||
      (select count(*) from public.pro_commercial_term_events where ${termEventPredicate()}) || '|' ||
      (select count(*) from public.tenant_audit_log where ${tenantAuditPredicate()}) || '|' ||
      (select count(*) from public.auth_events where ${authEventPredicate()}) || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts
        where entity_id in (${termIds.map(sqlLiteral).join(',')})) || '|' ||
      (select count(*) from public.domain_events where ${eventPredicate()}) || '|' ||
      (select count(*) from public.event_jobs where event_id in
        (select id from public.domain_events where ${eventPredicate()}));`),
    '1|1|2|1|2|2|2|2',
    'Replay changed assignment/term/event/audit/receipt/domain-event/job cardinality',
  );
  assertOneJobPerFixtureEvent();
  console.log(
    'PASS both final-schema assignment/commercial-term schedules and term winner replays',
  );
}

const harnessLock = await acquireHarnessLock();
let cleanupOwnedFixtures = false;
let cleanupTriggerStates;
try {
  assert.equal(
    sql(`select pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`),
    'f',
    'Harness advisory lock is not exclusive',
  );
  cleanupTriggerStates = snapshotCleanupTriggerStates();
  assertExpectedCleanupTriggerStates(cleanupTriggerStates);
  if (cleanupOwnerToken !== undefined) {
    cleanup(cleanupTriggerStates);
    assert.equal(fixtureCount(), '0', 'Exact owner-token cleanup failed');
    assertCleanupTriggerStates(
      cleanupTriggerStates,
      'Owner-token cleanup did not restore exact trigger states',
    );
    console.log('PASS exact owner-token fixture cleanup recovery');
  } else {
    assert.equal(fixtureCount(), '0', 'Reserved fixture collision: refusing setup and cleanup');
    printRecoveryInstructions();
    try {
      setup();
      cleanupOwnedFixtures = true;
    } catch (setupError) {
      let ownCommitLanded;
      try {
        ownCommitLanded = ownershipMarkerMatches();
      } catch (markerLookupError) {
        printRecoveryInstructions();
        throw new AggregateError(
          [setupError, markerLookupError],
          'Setup outcome is ambiguous; use the emitted exact owner token for recovery',
        );
      }
      if (ownCommitLanded) cleanupOwnedFixtures = true;
      throw setupError;
    }
    assertOwnershipMarker();
    assertFixturePreflight();
    await runRaces();
  }
} finally {
  try {
    if (cleanupOwnedFixtures) {
      cleanup(cleanupTriggerStates);
      assert.equal(fixtureCount(), '0', 'Exact synthetic fixture cleanup failed');
      assertCleanupTriggerStates(
        cleanupTriggerStates,
        'Final cleanup did not restore exact trigger states',
      );
      console.log('PASS Exact synthetic fixture cleanup and P3.10 event/job cleanup');
    }
  } finally {
    await harnessLock.release();
  }
}
