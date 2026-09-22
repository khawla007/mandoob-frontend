// Final-schema P3.03/P3.10 settings race checks. Never resets, migrates, or drops a database.
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

const id = (n) => `95310000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1);
const settingsPro = id(2);
const settingsTenant = id(3);
const settingsCompany = id(4);
const settingsCredential = id(5);
const settingsAssignment = id(6);
const fixtureIds = [
  admin,
  settingsPro,
  settingsTenant,
  settingsCompany,
  settingsCredential,
  settingsAssignment,
];
function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
const quotedFixtureIds = fixtureIds.map(sqlLiteral).join(',');
const runToken = randomUUID().replaceAll('-', '').slice(0, 12);
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
    .replaceAll(/cipher-[a-z0-9-]+/giu, '[REDACTED]')
    .replaceAll(/repeat\('[a-f0-9]',64\)/giu, '[REDACTED_HASH]');
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

function terminateBackend(pid) {
  if (!Number.isInteger(pid)) return;
  spawnSync('docker', dockerArgs, {
    input: `select pg_catalog.pg_cancel_backend(${pid}); select pg_catalog.pg_terminate_backend(${pid});`,
    encoding: 'utf8',
    timeout: 10_000,
  });
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
      clearTimeout(timer);
      if (backendPidValue === undefined) resolvePid(undefined);
      if (timedOut) {
        reject(new Error(`Worker exceeded ${timeoutMs}ms:\n${output}`));
      } else if (processError) {
        reject(processError);
      } else {
        resolve({ exit, output });
      }
    });
  });
  timer = setTimeout(() => {
    timedOut = true;
    terminateBackend(backendPidValue);
    child.kill();
  }, timeoutMs);

  child.stdin.write(
    `\\pset tuples_only on\n\\pset format unaligned\nselect 'P303_BACKEND_PID=' || pg_catalog.pg_backend_pid();\n${input}\n`,
  );
  if (endInput) child.stdin.end();
  return {
    child,
    completion,
    backendPid,
    getOutput() {
      return output;
    },
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
const HARNESS_LOCK_KEY = 953100303;

async function acquireHarnessLock() {
  const applicationName = `p303-${runToken}-harness-lock`;
  const session = worker(
    `set application_name=${sqlLiteral(applicationName)};
     select 'P303_LOCK=' || pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`,
    { endInput: false, timeoutMs: 90_000 },
  );
  const backendPid = await session.backendPid;
  assert.equal(Number.isInteger(backendPid), true, 'Harness lock backend PID was not captured');
  await session.waitForOutput('P303_LOCK=');
  if (!session.getOutput().includes('P303_LOCK=t')) {
    session.child.stdin.end('\\q\n');
    await session.completion;
    throw new Error('Another P3.03 settings harness owns the fixture lock');
  }
  return {
    async release() {
      session.child.stdin.write(
        `select 'P303_UNLOCK=' || pg_catalog.pg_advisory_unlock(${HARNESS_LOCK_KEY});\n`,
      );
      await session.waitForOutput('P303_UNLOCK=t');
      session.child.stdin.end('\\q\n');
      const result = await session.completion;
      assert.equal(result.exit, 0, `Harness lock release failed:\n${result.output}`);
    },
  };
}

async function contend(label, first, second, expectedSecondError = null) {
  const suffix = label.replaceAll(/[^a-z0-9]/giu, '-').slice(0, 24);
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
  assert.equal(
    sql(
      `select exists(select 1 from pg_catalog.pg_stat_activity where pid=${aPid} and application_name=${sqlLiteral(appA)} and state='active');`,
    ),
    't',
    `${label}: held A backend is not active`,
  );

  const sessionB = worker(
    `\\set VERBOSITY verbose\nset application_name=${sqlLiteral(appB)}; begin;
     set local statement_timeout='12s'; ${second} commit;`,
  );
  const bPid = await sessionB.backendPid;
  assert.equal(Number.isInteger(bPid), true, `${label}: B backend PID was not captured`);
  let blocked = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    blocked =
      sql(
        `select exists(select 1 from pg_catalog.pg_stat_activity a cross join pg_catalog.pg_stat_activity b where a.pid=${aPid} and b.pid=${bPid} and a.application_name=${sqlLiteral(appA)} and b.application_name=${sqlLiteral(appB)} and a.pid=any(pg_catalog.pg_blocking_pids(b.pid)));`,
      ) === 't';
    if (blocked) break;
    await wait(50);
  }

  const [a, b] = await Promise.all([sessionA.completion, sessionB.completion]);
  assert.equal(a.exit, 0, `${label}: first RPC failed\n${a.output}`);
  assert.equal(blocked, true, `${label}: actual RPC blocking was not observed\n${b.output}`);
  if (expectedSecondError) {
    assert.notEqual(b.exit, 0, `${label}: losing RPC unexpectedly committed`);
    assert.match(b.output, expectedSecondError, `${label}: unexpected losing error`);
  } else {
    assert.equal(b.exit, 0, `${label}: replay/winner RPC failed\n${b.output}`);
  }
  console.log(`PASS ${label}: blocked and serialized`);
  return { a: a.output, b: b.output };
}

function eventPredicate() {
  return `(tenant_id=${sqlLiteral(settingsTenant)} or company_id=${sqlLiteral(settingsCompany)}
    or payload ->> 'resource_id'=${sqlLiteral(settingsCompany)})`;
}

function cleanup() {
  sql(`begin;
    set local statement_timeout='20s';
    delete from public.pro_assignment_term_links where assignment_id in
      (select id from public.pro_company_assignments where id in (${quotedFixtureIds}) or company_id in (${quotedFixtureIds}) or pro_profile_id in (${quotedFixtureIds}));
    delete from public.pro_company_assignments where id in (${quotedFixtureIds}) or company_id in (${quotedFixtureIds}) or pro_profile_id in (${quotedFixtureIds});
    update public.profiles set tenant_id=null where id in (${quotedFixtureIds});
    delete from public.company_settings_operations where tenant_id in (${quotedFixtureIds});
    delete from public.company_settings_versions where tenant_id in (${quotedFixtureIds});
    delete from public.tenant_smtp_config where tenant_id in (${quotedFixtureIds});
    delete from public.tenant_whatsapp_config where tenant_id in (${quotedFixtureIds});
    delete from public.pro_credentials where id in (${quotedFixtureIds}) or pro_profile_id in (${quotedFixtureIds});
    delete from public.tenant_audit_log where tenant_id in (${quotedFixtureIds}) or actor_id in (${quotedFixtureIds});

    alter table public.event_job_attempts disable trigger event_job_attempts_immutable;
    alter table public.event_replay_requests disable trigger event_replay_requests_immutable;
    alter table public.domain_events disable trigger domain_events_immutable;
    update public.event_jobs set replay_request_id=null where event_id in (select id from public.domain_events where ${eventPredicate()});
    delete from public.event_job_attempts where job_id in (select id from public.event_jobs where event_id in (select id from public.domain_events where ${eventPredicate()}));
    delete from public.event_replay_requests where source_job_id in (select id from public.event_jobs where event_id in (select id from public.domain_events where ${eventPredicate()}))
      or replay_job_id in (select id from public.event_jobs where event_id in (select id from public.domain_events where ${eventPredicate()}));
    delete from public.event_jobs where event_id in (select id from public.domain_events where ${eventPredicate()});
    delete from public.domain_events where ${eventPredicate()};
    alter table public.domain_events enable trigger domain_events_immutable;
    alter table public.event_replay_requests enable trigger event_replay_requests_immutable;
    alter table public.event_job_attempts enable trigger event_job_attempts_immutable;

    delete from public.company_profiles where id in (${quotedFixtureIds}) or tenant_id in (${quotedFixtureIds});
    delete from public.tenants where id in (${quotedFixtureIds});
    delete from public.pro_profiles where profile_id in (${quotedFixtureIds});
    delete from public.profiles where id in (${quotedFixtureIds});
    delete from auth.users where id in (${quotedFixtureIds});
    commit;`);
}

function insertUsersAndProfiles() {
  sql(`begin;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values
      (${sqlLiteral(admin)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated','combined-admin@example.invalid','',now(),'{}','{}',now(),now()),
      (${sqlLiteral(settingsPro)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated','combined-settings@example.invalid','',now(),'{}','{}',now(),now());
    insert into public.profiles(id,role,status,full_name) values
      (${sqlLiteral(admin)},'super_admin','active','Combined Race Admin'),
      (${sqlLiteral(settingsPro)},'pro','active','Combined Settings PRO');
    insert into public.pro_profiles(profile_id) values (${sqlLiteral(settingsPro)});
    commit;`);
}

function setupSettings() {
  sql(`begin;
    insert into public.tenants(id,name,slug,status) values(${sqlLiteral(settingsTenant)},'Combined Settings','combined-settings-9531','active');
    insert into public.company_profiles(id,tenant_id,company_name,status) values(${sqlLiteral(settingsCompany)},${sqlLiteral(settingsTenant)},'Combined Settings LLC','active');
    insert into public.pro_credentials(id,pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by)
      values(${sqlLiteral(settingsCredential)},${sqlLiteral(settingsPro)},'synthetic',repeat('1',64),'9531','Synthetic Authority',current_date-30,current_date+365,'verified',1,now(),${sqlLiteral(admin)});
    insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_by)
      values(${sqlLiteral(settingsAssignment)},${sqlLiteral(settingsTenant)},${sqlLiteral(settingsCompany)},${sqlLiteral(settingsPro)},${sqlLiteral(admin)});
    update public.profiles set tenant_id=${sqlLiteral(settingsTenant)} where id=${sqlLiteral(settingsPro)};
    update auth.users set raw_app_meta_data=jsonb_build_object('tenant_id',${sqlLiteral(settingsTenant)}) where id=${sqlLiteral(settingsPro)};
    commit;`);
}

const smtp = JSON.stringify({
  host: 'smtp.example.test',
  port: 587,
  username: 'fixture',
  from_address: 'fixture@example.test',
  enabled: true,
});
const branding = JSON.stringify({
  name: 'Combined firm',
  logo_url: null,
  favicon_url: null,
  primary_color: '#123456',
  secondary_color: null,
});
const contact = JSON.stringify({
  email_sender_name: 'Combined firm',
  email_reply_to: null,
  terms_url: null,
  privacy_url: null,
});
function settingsRpc(section, operation, version, input, secret = 'null', fingerprint = 'null') {
  return `select public.mutate_assigned_company_settings(${sqlLiteral(settingsPro)},${sqlLiteral(settingsTenant)},${sqlLiteral(settingsCompany)},${sqlLiteral(section)},${sqlLiteral(id(operation))},${version},${sqlLiteral(input)}::jsonb,${secret},${fingerprint});`;
}

function fixtureCount() {
  return sql(`select
    (select count(*) from auth.users where id in (${quotedFixtureIds})) +
    (select count(*) from public.profiles where id in (${quotedFixtureIds})) +
    (select count(*) from public.tenants where id in (${quotedFixtureIds})) +
    (select count(*) from public.company_profiles where id in (${quotedFixtureIds})) +
    (select count(*) from public.pro_credentials where id in (${quotedFixtureIds}) or pro_profile_id in (${quotedFixtureIds})) +
    (select count(*) from public.pro_company_assignments where id in (${quotedFixtureIds}) or company_id in (${quotedFixtureIds}) or pro_profile_id in (${quotedFixtureIds})) +
    (select count(*) from public.domain_events where ${eventPredicate()});`);
}

async function runRaces() {
  insertUsersAndProfiles();
  setupSettings();

  const replay = await contend(
    'settings-identical-replay',
    settingsRpc('smtp', 60, 0, smtp, sqlLiteral('cipher-one'), `repeat('a',64)`),
    settingsRpc(
      'smtp',
      60,
      0,
      smtp,
      sqlLiteral('different-randomized-ciphertext'),
      `repeat('a',64)`,
    ),
  );
  const firstResult = replay.a.split('\n').find((line) => line.startsWith('{'));
  const replayResult = replay.b.split('\n').find((line) => line.startsWith('{'));
  assert.deepEqual(
    JSON.parse(replayResult),
    JSON.parse(firstResult),
    'settings replay changed result',
  );
  assert.equal(
    sql(
      `select version from public.company_settings_versions where tenant_id=${sqlLiteral(settingsTenant)} and section='smtp';`,
    ),
    '1',
  );
  assert.equal(
    sql(
      `select count(*) from public.company_settings_operations where tenant_id=${sqlLiteral(settingsTenant)} and operation_id=${sqlLiteral(id(60))};`,
    ),
    '1',
    'settings replay created duplicate operation receipts',
  );
  assert.equal(
    sql(
      `select count(*) from public.tenant_audit_log where tenant_id=${sqlLiteral(settingsTenant)} and action='updated' and details ->> 'entity'='company_settings' and details ->> 'operation_id'=${sqlLiteral(id(60))};`,
    ),
    '1',
    'settings replay created duplicate audit rows',
  );
  assert.equal(
    sql(
      `select count(*) from public.domain_events where event_type='company.settings.updated' and tenant_id=${sqlLiteral(settingsTenant)} and company_id=${sqlLiteral(settingsCompany)} and payload ->> 'operation_id'=${sqlLiteral(id(60))};`,
    ),
    '1',
    'settings replay created duplicate domain events',
  );
  assert.equal(
    sql(
      `select count(*) from public.event_jobs job join public.domain_events event on event.id=job.event_id where event.event_type='company.settings.updated' and event.tenant_id=${sqlLiteral(settingsTenant)} and event.company_id=${sqlLiteral(settingsCompany)} and event.payload ->> 'operation_id'=${sqlLiteral(id(60))};`,
    ),
    '1',
    'settings replay created duplicate event jobs',
  );

  await contend(
    'settings-same-version',
    settingsRpc('branding', 61, 0, branding),
    settingsRpc('branding', 62, 0, branding),
    /STALE_SETTINGS_VERSION/u,
  );

  await contend(
    'settings-secret-rotation',
    settingsRpc(
      'smtp',
      63,
      1,
      smtp.replace('fixture', 'rotated'),
      sqlLiteral('cipher-rotated'),
      `repeat('b',64)`,
    ),
    settingsRpc('smtp', 64, 1, smtp.replace('fixture', 'blank-save')),
    /STALE_SETTINGS_VERSION/u,
  );
  sql(settingsRpc('smtp', 65, 2, smtp.replace('fixture', 'retry-after-rotation')));
  assert.equal(
    sql(
      `select v.version=3 and c.password_encrypted=${sqlLiteral('cipher-rotated')} from public.tenant_smtp_config c join public.company_settings_versions v using(tenant_id) where c.tenant_id=${sqlLiteral(settingsTenant)} and v.section='smtp';`,
    ),
    't',
    'blank-secret retry did not preserve the winning rotation',
  );

  assert.equal(
    sql(
      `select public.read_assigned_company_settings(${sqlLiteral(settingsPro)},${sqlLiteral(settingsTenant)},${sqlLiteral(settingsCompany)}) #>> '{versions,smtp}';`,
    ),
    '3',
    'assignment-loss preflight failed',
  );
  await contend(
    'settings-assignment-loss',
    `select public.release_company_pro(${sqlLiteral(settingsCompany)},${sqlLiteral(settingsAssignment)},${sqlLiteral('Synthetic combined race')},${sqlLiteral(admin)});`,
    settingsRpc('contact', 66, 0, contact),
    /FORBIDDEN/u,
  );
  assert.equal(
    sql(
      `select count(*) from public.domain_events where event_type='company.settings.updated' and tenant_id=${sqlLiteral(settingsTenant)} and company_id=${sqlLiteral(settingsCompany)};`,
    ),
    '4',
    'settings event cardinality changed',
  );

  assert.equal(
    sql(
      `select not exists(
        select event.id from public.domain_events event
        left join public.event_jobs job on job.event_id=event.id
        where ${eventPredicate()}
        group by event.id having count(job.id) <> 1
      );`,
    ),
    't',
    'P3.10 did not create exactly one job for every fixture event',
  );
  console.log('PASS all four combined final-schema settings races');
}

const harnessLock = await acquireHarnessLock();
assert.equal(
  sql(`select pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`),
  'f',
  'Harness advisory lock is not exclusive',
);
let cleanupOwnedFixtures = false;
try {
  if (process.env.P303_COMBINED_CLEANUP_ONLY === '1') {
    cleanup();
    assert.equal(fixtureCount(), '0', 'Exact cleanup-only recovery failed');
    console.log('PASS exact synthetic fixture cleanup-only recovery');
  } else {
    assert.equal(fixtureCount(), '0', 'Reserved fixture collision: refusing setup and cleanup');
    cleanupOwnedFixtures = true;
    await runRaces();
  }
} finally {
  try {
    if (cleanupOwnedFixtures) {
      cleanup();
      assert.equal(fixtureCount(), '0', 'Exact synthetic fixture cleanup failed');
      console.log('PASS exact synthetic fixture and P3.10 event/job cleanup');
    }
  } finally {
    await harnessLock.release();
  }
}
