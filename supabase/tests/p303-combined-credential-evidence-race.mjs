// Final-schema P3.03/P3.10 credential decision/evidence race checks. Never resets, migrates, or drops a database.
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

const id = (n) => `95320000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1);
const decisionPro = id(2);
const evidencePro = id(3);
const decisionCredential = id(10);
const evidenceCredential = id(11);
const decisionBaselineEvidence = id(20);
const evidenceBaselineEvidence = id(21);
const decisionOperation = id(30);
const decisionUploadOperation = id(31);
const evidenceOperation = id(32);
const evidenceDecisionOperation = id(33);
const decisionReservation = id(40);
const evidenceReservation = id(41);
const ownerMarkerEntity = id(50);
const ownerMarkerOperation = id(51);
const fixtureIds = [
  admin,
  decisionPro,
  evidencePro,
  decisionCredential,
  evidenceCredential,
  decisionBaselineEvidence,
  evidenceBaselineEvidence,
  decisionOperation,
  decisionUploadOperation,
  evidenceOperation,
  evidenceDecisionOperation,
  decisionReservation,
  evidenceReservation,
  ownerMarkerEntity,
  ownerMarkerOperation,
];

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlUuid(value) {
  return `${sqlLiteral(value)}::uuid`;
}

const quotedFixtureIds = fixtureIds.map(sqlLiteral).join(',');
const cleanupOwnerToken = process.env.P303_COMBINED_CLEANUP_OWNER_TOKEN;
if (cleanupOwnerToken !== undefined) {
  assert.match(
    cleanupOwnerToken,
    /^[a-f0-9]{12}$/u,
    'Cleanup owner token must be 12 lowercase hex characters',
  );
}
const runToken = cleanupOwnerToken ?? randomUUID().replaceAll('-', '').slice(0, 12);
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
    .replaceAll(/pro-credentials\/[a-z0-9/-]+/giu, '[REDACTED_PATH]')
    .replaceAll(/[a-f0-9]{64}/giu, '[REDACTED_HASH]')
    .replaceAll(/[a-z0-9._%+-]+@example[.]invalid/giu, '[REDACTED_EMAIL]');
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
    getOutput: () => output,
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
const HARNESS_LOCK_KEY = 953200303;

async function acquireHarnessLock() {
  const applicationName = `p303-${runToken}-credential-race-lock`;
  const session = worker(
    `set application_name=${sqlLiteral(applicationName)};
     set idle_session_timeout='0';
     set idle_in_transaction_session_timeout='0';
     select 'P303_LOCK=' || pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`,
    { endInput: false, timeoutMs: null },
  );
  const backendPid = await session.backendPid;
  assert.equal(Number.isInteger(backendPid), true, 'Harness lock backend PID was not captured');
  await session.waitForOutput('P303_LOCK=');
  if (!session.getOutput().includes('P303_LOCK=t')) {
    session.child.stdin.end('\\q\n');
    await session.completion;
    throw new Error('Another P3.03 credential race harness owns the fixture lock');
  }
  return {
    async release() {
      try {
        session.child.stdin.write(
          `select 'P303_UNLOCK=' || pg_catalog.pg_advisory_unlock(${HARNESS_LOCK_KEY});\n`,
        );
        await session.waitForOutput('P303_UNLOCK=t');
        session.child.stdin.end('\\q\n');
        const result = await session.completion;
        assert.equal(result.exit, 0, `Harness lock release failed:\n${result.output}`);
      } finally {
        terminateBackend(backendPid);
        session.child.kill();
      }
    },
  };
}

async function contend(label, first, second) {
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
  assert.equal(a.exit, 0, `${label}: winning RPC failed\n${a.output}`);
  assert.equal(
    blocked,
    true,
    `${label}: exact PID-specific blocking was not observed\n${b.output}`,
  );
  assert.notEqual(b.exit, 0, `${label}: losing RPC unexpectedly committed`);
  assert.match(b.output, /STALE_CREDENTIAL_VERSION/u, `${label}: losing RPC was not stale`);
  console.log(`PASS ${label}: exact PIDs blocked and stale loser rolled back`);
  return a.output;
}

const credentialIds = [decisionCredential, evidenceCredential];
const proIds = [decisionPro, evidencePro];
const eventPredicate = () =>
  `(payload ->> 'resource_id' in (${credentialIds.map(sqlLiteral).join(',')})
    or payload ->> 'subject_id' in (${proIds.map(sqlLiteral).join(',')})
    or payload ->> 'evidence_id' in (${quotedFixtureIds}))`;

function credentialPredicate() {
  return `(id in (${credentialIds.map(sqlLiteral).join(',')})
    or pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))`;
}

function evidencePredicate() {
  return `(id in (${quotedFixtureIds})
    or credential_id in (${credentialIds.map(sqlLiteral).join(',')}))`;
}

function decisionPredicate() {
  return `(credential_id in (${credentialIds.map(sqlLiteral).join(',')})
    or pro_profile_id in (${proIds.map(sqlLiteral).join(',')}))`;
}

function receiptPredicate() {
  return `(entity_id in (${quotedFixtureIds})
    or operation_id in (${quotedFixtureIds}))`;
}

function reservationPredicate() {
  return `(id in (${quotedFixtureIds})
    or credential_id in (${credentialIds.map(sqlLiteral).join(',')})
    or operation_id in (${quotedFixtureIds}))`;
}

function authEventPredicate() {
  return `(actor_user_id in (${quotedFixtureIds})
    or details ->> 'targetProProfileId' in (${proIds.map(sqlLiteral).join(',')})
    or details ->> 'entityId' in (${credentialIds.map(sqlLiteral).join(',')}))`;
}

function cleanup() {
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
    alter table public.domain_events enable trigger domain_events_immutable;
    alter table public.event_replay_requests enable trigger event_replay_requests_immutable;
    alter table public.event_job_attempts enable trigger event_job_attempts_immutable;

    delete from public.auth_events where ${authEventPredicate()};
    delete from public.pro_lifecycle_operation_receipts
      where ${receiptPredicate()};
    delete from public.pro_credential_decisions
      where ${decisionPredicate()};
    alter table public.pro_credential_evidence_upload_reservations
      disable trigger guard_pro_credential_evidence_upload_reservation;
    delete from public.pro_credential_evidence_upload_reservations
      where ${reservationPredicate()};
    alter table public.pro_credential_evidence_upload_reservations
      enable trigger guard_pro_credential_evidence_upload_reservation;
    alter table public.pro_credential_evidence
      disable trigger pro_credential_evidence_guard_delete;
    alter table public.pro_credential_evidence disable trigger emit_pro_evidence_event;
    delete from public.pro_credential_evidence
      where ${evidencePredicate()};
    alter table public.pro_credential_evidence enable trigger emit_pro_evidence_event;
    alter table public.pro_credential_evidence
      enable trigger pro_credential_evidence_guard_delete;
    delete from public.pro_credentials
      where ${credentialPredicate()};
    delete from public.pro_profiles where profile_id in (${proIds.map(sqlLiteral).join(',')});
    delete from public.profiles where id in (${quotedFixtureIds});
    delete from auth.users where id in (${quotedFixtureIds});
    commit;`);
}

function fixtureCount() {
  return sql(`select
    (select count(*) from auth.users where id in (${quotedFixtureIds})) +
    (select count(*) from public.profiles where id in (${quotedFixtureIds})) +
    (select count(*) from public.pro_profiles where profile_id in (${proIds.map(sqlLiteral).join(',')})) +
    (select count(*) from public.pro_credentials where ${credentialPredicate()}) +
    (select count(*) from public.pro_credential_evidence where ${evidencePredicate()}) +
    (select count(*) from public.pro_credential_evidence_upload_reservations where ${reservationPredicate()}) +
    (select count(*) from public.pro_credential_decisions where ${decisionPredicate()}) +
    (select count(*) from public.pro_lifecycle_operation_receipts where ${receiptPredicate()}) +
    (select count(*) from public.auth_events where ${authEventPredicate()}) +
    (select count(*) from public.domain_events where ${eventPredicate()});`);
}

const pathFor = (proId, credentialId, evidenceId) =>
  `pro-credentials/${proId}/${credentialId}/${evidenceId}`;

function finalizeUploadRpc(proId, credentialId, operationId, hashCharacter) {
  return `select public.finalize_pro_credential_evidence_upload(
    ${sqlLiteral(proId)},${sqlLiteral(credentialId)},0,${sqlLiteral(operationId)},
    repeat(${sqlLiteral(hashCharacter)},64),${sqlLiteral(operationId)},
    ${sqlLiteral(pathFor(proId, credentialId, operationId))},'application/pdf',9,
    repeat(${sqlLiteral(hashCharacter)},64),'license.pdf','clamav',
    (select scan_completed_at from public.pro_credential_evidence_upload_reservations
      where credential_id=${sqlLiteral(credentialId)} and operation_id=${sqlLiteral(operationId)})
  );`;
}

function submitRpc(proId, credentialId, operationId, hashCharacter) {
  return `select public.submit_pro_credential(
    ${sqlLiteral(proId)},${sqlLiteral(credentialId)},0,${sqlLiteral(operationId)},
    repeat(${sqlLiteral(hashCharacter)},64)
  );`;
}

function setup() {
  sql(`begin;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values
      (${sqlLiteral(admin)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated','credential-race-admin@example.invalid','',now(),'{}','{}',now(),now()),
      (${sqlLiteral(decisionPro)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated','credential-race-decision@example.invalid','',now(),'{}','{}',now(),now()),
      (${sqlLiteral(evidencePro)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated','credential-race-evidence@example.invalid','',now(),'{}','{}',now(),now());
    insert into public.profiles(id,role,status,full_name) values
      (${sqlLiteral(admin)},'super_admin','active','Credential Race Admin'),
      (${sqlLiteral(decisionPro)},'pro','active','Decision Winner PRO'),
      (${sqlLiteral(evidencePro)},'pro','active','Evidence Winner PRO');
    insert into public.pro_profiles(profile_id) values
      (${sqlLiteral(decisionPro)}),(${sqlLiteral(evidencePro)});
    insert into public.pro_credentials(
      id,pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,
      issuing_authority,issue_date,expiry_date,state,version,created_by,created_at,updated_at
    ) values
      (${sqlLiteral(decisionCredential)},${sqlLiteral(decisionPro)},'synthetic',repeat('1',64),'3201','Synthetic Authority',current_date-30,current_date+365,'draft',0,${sqlLiteral(decisionPro)},pg_catalog.now()-interval '35 minutes',pg_catalog.now()-interval '35 minutes'),
      (${sqlLiteral(evidenceCredential)},${sqlLiteral(evidencePro)},'synthetic',repeat('2',64),'3202','Synthetic Authority',current_date-30,current_date+365,'draft',0,${sqlLiteral(evidencePro)},pg_catalog.now()-interval '35 minutes',pg_catalog.now()-interval '35 minutes');
    insert into public.pro_credential_evidence(
      id,pro_profile_id,credential_id,storage_path,mime_type,size_bytes,sha256,
      original_name_safe,scan_provider,scan_completed_at,uploaded_by,created_at,updated_at
    ) values
      (${sqlLiteral(decisionBaselineEvidence)},${sqlLiteral(decisionPro)},${sqlLiteral(decisionCredential)},${sqlLiteral(pathFor(decisionPro, decisionCredential, decisionBaselineEvidence))},'application/pdf',9,repeat('3',64),'baseline.pdf','clamav',pg_catalog.now()-interval '31 minutes',${sqlLiteral(decisionPro)},pg_catalog.now()-interval '30 minutes',pg_catalog.now()-interval '30 minutes'),
      (${sqlLiteral(evidenceBaselineEvidence)},${sqlLiteral(evidencePro)},${sqlLiteral(evidenceCredential)},${sqlLiteral(pathFor(evidencePro, evidenceCredential, evidenceBaselineEvidence))},'application/pdf',9,repeat('4',64),'baseline.pdf','clamav',pg_catalog.now()-interval '31 minutes',${sqlLiteral(evidencePro)},pg_catalog.now()-interval '30 minutes',pg_catalog.now()-interval '30 minutes');
    with historical as (
      select
        pg_catalog.now()-interval '21 minutes' as scan_completed_at,
        pg_catalog.now()-interval '20 minutes' as created_at,
        pg_catalog.now()-interval '20 minutes' as updated_at,
        pg_catalog.now()-interval '5 minutes' as lease_expires_at
    )
    insert into public.pro_credential_evidence_upload_reservations(
      id,pro_profile_id,credential_id,actor_id,expected_version,operation_id,
      payload_hash,evidence_id,storage_path,mime_type,size_bytes,sha256,
      original_name_safe,scan_provider,scan_completed_at,status,lease_expires_at,
      created_at,updated_at
    )
    select
      ${sqlUuid(decisionReservation)},${sqlUuid(decisionPro)},${sqlUuid(decisionCredential)},${sqlUuid(decisionPro)},0,${sqlUuid(decisionUploadOperation)},
      repeat('5',64),${sqlUuid(decisionUploadOperation)},${sqlLiteral(pathFor(decisionPro, decisionCredential, decisionUploadOperation))},'application/pdf',9,repeat('5',64),
      'license.pdf','clamav',scan_completed_at,'prepared',lease_expires_at,created_at,updated_at
    from historical
    union all
    select
      ${sqlUuid(evidenceReservation)},${sqlUuid(evidencePro)},${sqlUuid(evidenceCredential)},${sqlUuid(evidencePro)},0,${sqlUuid(evidenceOperation)},
      repeat('6',64),${sqlUuid(evidenceOperation)},${sqlLiteral(pathFor(evidencePro, evidenceCredential, evidenceOperation))},'application/pdf',9,repeat('6',64),
      'license.pdf','clamav',scan_completed_at,'prepared',lease_expires_at,created_at,updated_at
    from historical;
    insert into public.pro_lifecycle_operation_receipts(
      entity_kind,entity_id,operation_id,payload_hash,sanitized_result
    ) values(
      'credential',${sqlLiteral(ownerMarkerEntity)},${sqlLiteral(ownerMarkerOperation)},
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(${sqlLiteral(runToken)},'UTF8')),'hex'),
      pg_catalog.jsonb_build_object('harness','p303-credential-evidence-race','runToken',${sqlLiteral(runToken)})
    );
    commit;`);
  assert.equal(
    sql(`select exists(select 1 from public.pro_lifecycle_operation_receipts
      where entity_id=${sqlLiteral(ownerMarkerEntity)}
        and operation_id=${sqlLiteral(ownerMarkerOperation)}
        and sanitized_result ->> 'runToken'=${sqlLiteral(runToken)});`),
    't',
    'Durable run-token ownership marker was not committed',
  );
  assert.equal(
    sql(`select count(*) from public.pro_credential_evidence_upload_reservations
      where ${reservationPredicate()} and status='prepared'
        and scan_completed_at < created_at
        and created_at = updated_at
        and updated_at < lease_expires_at
        and lease_expires_at < pg_catalog.now();`),
    '2',
    'Coherent historical expired upload reservations were not constructed',
  );
  assert.equal(
    sql(`select count(*) from public.pro_credentials credential
      join public.pro_credential_evidence baseline
        on baseline.credential_id=credential.id
       and baseline.id in (${sqlLiteral(decisionBaselineEvidence)},${sqlLiteral(evidenceBaselineEvidence)})
      join public.pro_credential_evidence_upload_reservations reservation
        on reservation.credential_id=credential.id
      where reservation.id in (${sqlLiteral(decisionReservation)},${sqlLiteral(evidenceReservation)})
        and credential.created_at < baseline.scan_completed_at
        and baseline.scan_completed_at < baseline.created_at
        and baseline.created_at = baseline.updated_at
        and baseline.updated_at < reservation.scan_completed_at
        and reservation.scan_completed_at < reservation.created_at
        and reservation.created_at = reservation.updated_at
        and reservation.updated_at < reservation.lease_expires_at
        and reservation.lease_expires_at < pg_catalog.now();`),
    '2',
    'Full parent-child fixture chronology is inconsistent',
  );
}

const jsonResult = (output) => JSON.parse(output.split('\n').find((line) => line.startsWith('{')));

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
  const baselineCounts = sql(`select
    (select count(*) from public.domain_events where ${eventPredicate()}) || '|' ||
    (select count(*) from public.event_jobs where event_id in
      (select id from public.domain_events where ${eventPredicate()}));`);
  assert.equal(
    baselineCounts,
    '0|0',
    'Non-workflow baseline fixture rows unexpectedly emitted causal events/jobs',
  );

  const decisionWinner = await contend(
    'credential-decision-wins',
    submitRpc(decisionPro, decisionCredential, decisionOperation, '7'),
    finalizeUploadRpc(decisionPro, decisionCredential, decisionUploadOperation, '5'),
  );
  assert.equal(
    sql(`select state || '|' || version || '|' ||
      (select count(*) from public.pro_credential_evidence where credential_id=${sqlLiteral(decisionCredential)})
      from public.pro_credentials where id=${sqlLiteral(decisionCredential)};`),
    'submitted|1|1',
    'Decision winner left partial credential/evidence state',
  );
  assert.equal(
    sql(`select
      (select count(*) from public.pro_credential_decisions where credential_id=${sqlLiteral(decisionCredential)} and event='submitted') || '|' ||
      (select count(*) from public.auth_events where details ->> 'entityId'=${sqlLiteral(decisionCredential)} and details ->> 'action'='credential_submitted') || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(decisionCredential)} and operation_id=${sqlLiteral(decisionOperation)}) || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(decisionCredential)} and operation_id=${sqlLiteral(decisionUploadOperation)}) || '|' ||
      (select count(*) from public.domain_events where event_type='pro.credential.submitted'
        and payload ->> 'resource_id'=${sqlLiteral(decisionCredential)}
        and payload ->> 'operation_id'=${sqlLiteral(decisionOperation)}
        and correlation_id=${sqlLiteral(decisionOperation)});`),
    '1|1|1|0|1',
    'Decision race left partial decision/audit/receipt/event fragments',
  );
  const decisionReplay = sql(submitRpc(decisionPro, decisionCredential, decisionOperation, '7'));
  assert.deepEqual(
    jsonResult(decisionReplay),
    jsonResult(decisionWinner),
    'winner replay changed result',
  );

  const evidenceWinner = await contend(
    'credential-evidence-wins',
    finalizeUploadRpc(evidencePro, evidenceCredential, evidenceOperation, '6'),
    submitRpc(evidencePro, evidenceCredential, evidenceDecisionOperation, '8'),
  );
  assert.equal(
    sql(`select state || '|' || version || '|' ||
      (select count(*) from public.pro_credential_evidence where credential_id=${sqlLiteral(evidenceCredential)})
      from public.pro_credentials where id=${sqlLiteral(evidenceCredential)};`),
    'draft|1|2',
    'Evidence winner left partial credential/evidence state',
  );
  assert.equal(
    sql(`select
      (select count(*) from public.pro_credential_decisions where credential_id=${sqlLiteral(evidenceCredential)}) || '|' ||
      (select count(*) from public.auth_events where details ->> 'entityId'=${sqlLiteral(evidenceCredential)} and details ->> 'action'='credential_evidence_added') || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(evidenceCredential)} and operation_id=${sqlLiteral(evidenceOperation)}) || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id=${sqlLiteral(evidenceCredential)} and operation_id=${sqlLiteral(evidenceDecisionOperation)}) || '|' ||
      (select count(*) from public.domain_events where event_type='pro.credential.evidence_changed'
        and payload ->> 'evidence_id'=${sqlLiteral(evidenceOperation)}
        and payload ->> 'operation_id'=${sqlLiteral(evidenceOperation)}
        and correlation_id=${sqlLiteral(evidenceOperation)});`),
    '0|1|1|0|1',
    'Evidence race left partial decision/audit/receipt/event fragments',
  );
  const evidenceReplay = sql(
    finalizeUploadRpc(evidencePro, evidenceCredential, evidenceOperation, '6'),
  );
  assert.deepEqual(
    jsonResult(evidenceReplay),
    jsonResult(evidenceWinner),
    'winner replay changed result',
  );
  assert.equal(
    sql(`select
      (select count(*) from public.pro_credential_evidence
        where credential_id=${sqlLiteral(evidenceCredential)} and id=${sqlLiteral(evidenceOperation)}) || '|' ||
      (select count(*) from public.pro_credential_evidence
        where credential_id=${sqlLiteral(evidenceCredential)});`),
    '1|2',
    'Evidence winner replay changed evidence identity/cardinality',
  );

  assert.equal(
    sql(`select
      (select count(*) from public.domain_events where ${eventPredicate()}) || '|' ||
      (select count(*) from public.event_jobs where event_id in
        (select id from public.domain_events where ${eventPredicate()})) || '|' ||
      (select count(*) from public.pro_credential_decisions where credential_id in (${credentialIds.map(sqlLiteral).join(',')})) || '|' ||
      (select count(*) from public.auth_events where details ->> 'entityId' in (${credentialIds.map(sqlLiteral).join(',')})) || '|' ||
      (select count(*) from public.pro_lifecycle_operation_receipts where entity_id in (${credentialIds.map(sqlLiteral).join(',')}));`),
    '2|2|1|2|2',
    'Winner replay duplicated credential/evidence/decision/audit/receipt/event/job state',
  );
  assert.equal(
    sql(`select not exists(
      select 1 from public.domain_events event
      where ${eventPredicate()}
        and (
          event.payload ->> 'operation_id' is null
          or event.correlation_id is distinct from (event.payload ->> 'operation_id')::uuid
        )
    );`),
    't',
    'Credential/evidence event lost its causal operation identity',
  );
  assertOneJobPerFixtureEvent();
  console.log('PASS both final-schema credential decision/evidence races and winner replays');
}

const harnessLock = await acquireHarnessLock();
let cleanupOwnedFixtures = false;
try {
  assert.equal(
    sql(`select pg_catalog.pg_try_advisory_lock(${HARNESS_LOCK_KEY});`),
    'f',
    'Harness advisory lock is not exclusive',
  );
  if (cleanupOwnerToken !== undefined) {
    cleanup();
    assert.equal(fixtureCount(), '0', 'Exact owner-token cleanup failed');
    console.log('PASS exact owner-token fixture cleanup recovery');
  } else {
    assert.equal(fixtureCount(), '0', 'Reserved fixture collision: refusing setup and cleanup');
    setup();
    cleanupOwnedFixtures = true;
    await runRaces();
  }
} finally {
  try {
    if (cleanupOwnedFixtures) {
      cleanup();
      assert.equal(fixtureCount(), '0', 'Exact synthetic fixture cleanup failed');
      console.log('PASS Exact synthetic fixture cleanup and P3.10 event/job cleanup');
    }
  } finally {
    await harnessLock.release();
  }
}
