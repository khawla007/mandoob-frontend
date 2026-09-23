import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// P3.06 Registration & Visa Workflow — two-session concurrency proof.
//
// Drives two REAL simultaneous transactions against the running local Supabase
// DB via `docker exec` + psql (no `pg` npm package), proving:
//
//   (a) Two simultaneous 'block' transitions of the SAME stage that pass the
//       SAME expected versions but carry DIFFERENT operation_ids: exactly one
//       commits (stage -> blocked, both versions +1, one stage event, one
//       receipt); the loser serializes on the stage row lock and then fails the
//       optimistic version check -> STALE_STAGE_VERSION. No lost update.
//
//   (b) Same-operation replay under concurrency: two simultaneous transitions
//       sharing the SAME operation_id + SAME payload_hash produce exactly ONE
//       registration_stage_events row and ONE stored receipt; both callers
//       observe an identical receipt (one executes, one replays via the receipt
//       scope FOR UPDATE lock in registration_replay_result).
//
// NOTE ON CLEANUP: migration 0107's event tables and the base domain_events
// queue are DELETE/UPDATE immutable, so a committed registration cannot be torn
// down. This harness therefore seeds a fresh, run-unique tenant namespace on
// every invocation (ids derived from Date.now()) and does NOT attempt teardown;
// the committed proof rows are self-isolating and harmless on the shared test
// DB. All rows this run creates live under one tenant uuid printed at the end.
//
// Prints a PASS/FAIL summary and exits non-zero on any failure.
// ---------------------------------------------------------------------------

const container = 'supabase_db_mandoob-p306';
const database = 'postgres';
const active = new Set();
let assertions = 0;
let failures = 0;

// Run-unique 12-hex suffix so repeated invocations never collide on committed
// (un-deletable) rows. Namespace prefix keeps these clearly synthetic.
const runSuffix = (Date.now() % 0xffffffffff).toString(16).padStart(10, '0');
const uid = (n) => `'99039699-0000-4000-8000-${runSuffix}${String(n).padStart(2, '0')}'::uuid`;
const rawUid = (n) => `99039699-0000-4000-8000-${runSuffix}${String(n).padStart(2, '0')}`;
const hx = (n) => `'${n.toString(16).padStart(64, '0')}'`;

function check(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.log(`FAIL_${label}`);
  } else {
    console.log(`OK_${label}`);
  }
}

// One-shot non-interactive psql batch.
function psql(sql, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        'PGPASSWORD=postgres',
        container,
        'psql',
        '-U',
        'postgres',
        '-d',
        database,
        '-X',
        '-q',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    active.add(child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {});
    child.on('error', () => reject(new Error('DOCKER_COMMAND_FAILED')));
    child.on('close', (code) => {
      clearTimeout(timer);
      active.delete(child);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(sql);
  });
}

// Long-lived holder session: opens a transaction that runs a transition and
// PARKS (uncommitted) holding the stage row lock. Announces BARRIER_READY on
// stdout when the lock is held; commits when told to.
function holder(sqlBeforeBarrier) {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGPASSWORD=postgres',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      database,
      '-X',
      '-q',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  active.add(child);
  let output = '';
  let stderr = '';
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const timer = setTimeout(() => rejectReady(new Error('HELD_BARRIER_TIMEOUT')), 20_000);
  child.stdout.on('data', (d) => {
    output += d;
    if (output.includes('BARRIER_READY')) {
      clearTimeout(timer);
      resolveReady();
    }
  });
  child.stderr.on('data', (d) => (stderr += d));
  child.stdin.on('error', () => {});
  const closed = new Promise((resolve) =>
    child.on('close', (code) => {
      active.delete(child);
      resolve({ code, output, stderr });
    }),
  );
  child.on('error', () => rejectReady(new Error('HELD_SPAWN_FAILED')));
  // Hold the transition open long enough for the contender to block, then let
  // the caller drive the commit via the returned handle.
  child.stdin.write(
    `begin;\nset local statement_timeout='0';\n${sqlBeforeBarrier}\nselect 'BARRIER_READY';\nselect pg_sleep(2.0);\n`,
  );
  return {
    ready,
    commit: async () => {
      child.stdin.end('commit;\n');
      return closed;
    },
    stderr: () => stderr,
    output: () => output,
  };
}

// Committed fixture (this run's isolated tenant). Creates the registration via
// the real RPC so seven stages + versions exist exactly as production makes.
const fixtureSql = `
insert into public.tenants(id, slug, name, status)
  values (${uid(0)}, 'reg-visa-conc-${runSuffix}', 'Concurrency Tenant ${runSuffix}', 'active');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  (${uid(1)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'reg-conc-${runSuffix}-admin@example.invalid', '', now(), '{}', '{}', now(), now()),
  (${uid(2)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'reg-conc-${runSuffix}-pro@example.invalid', '', now(), '{}', '{}', now(), now());
insert into public.profiles(id, tenant_id, role, status, mfa_enrolled_at) values
  (${uid(1)}, null, 'admin', 'active', now()),
  (${uid(2)}, ${uid(0)}, 'pro', 'active', null);
insert into public.company_profiles(id, tenant_id, company_name, status,
  licensing_authority, jurisdiction_type, legal_structure, trade_license_no, license_expiry)
  values (${uid(3)}, ${uid(0)}, 'Concurrency Co', 'active',
    'DED', 'mainland', 'llc', 'CN-${runSuffix.toUpperCase()}', current_date + 365);
insert into public.pro_profiles(profile_id) values (${uid(2)});
insert into public.pro_credentials(id, pro_profile_id, credential_type,
  identifier_ciphertext, identifier_hash, identifier_last4, issuing_authority,
  issue_date, expiry_date, state, version, submitted_at, created_by)
  values (${uid(4)}, ${uid(2)}, 'pro_license', 'synthetic',
    encode(sha256('reg-visa-conc-${runSuffix}'::bytea), 'hex'),
    '7770', 'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), ${uid(1)});
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by)
  values (${uid(5)}, ${uid(0)}, ${uid(3)}, ${uid(2)}, ${uid(1)});
select public.create_company_registration(
  ${uid(2)}, ${uid(0)}, ${uid(3)}, 'Concurrency Registration', 'normal', null,
  ${uid(10)}, ${hx(10)});
`;

// Bare function-call expression (no leading select / trailing semicolon) so it
// can be embedded in either `select (<expr>)` or `perform <expr>`.
function callExpr(command, reasonCode, reasonText, regId, stageId, expReg, expStage, opId, hashId) {
  return `public.transition_registration_stage(
    ${uid(2)}, ${uid(0)}, ${uid(3)}, '${regId}'::uuid, '${stageId}'::uuid, '${command}',
    ${expReg}, ${expStage}, '{}'::jsonb,
    '${reasonCode}', '${reasonText}', ${opId}, ${hashId})`;
}
const blockExpr = (regId, stageId, expReg, expStage, opId, hashId) =>
  callExpr(
    'block',
    'AUTHORITY_DELAY',
    'Synthetic concurrency block',
    regId,
    stageId,
    expReg,
    expStage,
    opId,
    hashId,
  );
const unblockExpr = (regId, stageId, expReg, expStage, opId, hashId) =>
  callExpr(
    'unblock',
    'AUTHORITY_RESUMED',
    'Synthetic concurrency unblock',
    regId,
    stageId,
    expReg,
    expStage,
    opId,
    hashId,
  );

async function main() {
  const setup = await psql(fixtureSql);
  if (setup.code !== 0) {
    console.log('FAIL_SETUP');
    console.log(setup.stderr.trim());
    failures += 1;
    return;
  }

  const idsRes = await psql(
    `select r.id::text || '|' || s.id::text || '|' || r.version::text || '|' || s.version::text
     from public.company_registrations r
     join public.registration_stages s on s.registration_id=r.id and s.code=r.current_stage
     where r.tenant_id=${uid(0)};`,
  );
  const [regId, stageId, regVer, stageVer] = idsRes.stdout.trim().split('|');
  if (!regId || !stageId) {
    console.log('FAIL_FIXTURE_IDS');
    failures += 1;
    return;
  }

  // -------------------------------------------------------------------------
  // (a) Two 'block' transitions, same expected versions, DIFFERENT op ids.
  // -------------------------------------------------------------------------
  {
    const h = holder(`select ${blockExpr(regId, stageId, regVer, stageVer, uid(20), hx(20))};`);
    await h.ready;
    // Contender: same expected versions, different op id. Blocks on the stage
    // row lock; once the holder commits it observes the bumped version.
    const contenderPromise = psql(
      // The contender's outcome is surfaced as an ERROR (reliably captured on
      // stderr regardless of client_min_messages / -q notice suppression):
      // it raises CONTENDER_LOST on the expected stale/invalid conflict, or
      // CONTENDER_WON if it unexpectedly committed a second advance.
      `do $$ begin
         perform ${blockExpr(regId, stageId, regVer, stageVer, uid(21), hx(21))};
         raise exception using errcode='P0001', message='CONTENDER_WON';
       exception when sqlstate 'P0001' then
         if sqlerrm = 'CONTENDER_WON' then raise; end if;
         if sqlerrm not in ('STALE_STAGE_VERSION','STALE_REGISTRATION_VERSION','INVALID_STAGE_TRANSITION') then
           raise exception 'CONTENDER_WRONG:%', sqlerrm;
         end if;
         raise exception using errcode='P0001', message='CONTENDER_LOST:'||sqlerrm;
       end $$;`,
      12000,
    );
    // Give the contender a moment to reach and block on the stage row lock,
    // THEN commit the holder so the contender proceeds and observes the bump.
    // (Do not await the contender before committing — that would deadlock.)
    await new Promise((r) => setTimeout(r, 800));
    const holderResult = await h.commit();
    const contender = await contenderPromise;
    if (process.env.CONC_DEBUG) console.error('CONTENDER_A', JSON.stringify(contender));

    check(
      holderResult.code === 0 && holderResult.output.includes('blocked'),
      'HOLDER_WON_AND_COMMITTED',
    );
    check(
      contender.stderr.includes('CONTENDER_LOST') && !contender.stderr.includes('CONTENDER_WON'),
      'CONTENDER_LOST_ON_STALE',
    );

    const inv = await psql(
      `select
         (select status::text from public.registration_stages where id='${stageId}'::uuid) || '|' ||
         (select version::text from public.registration_stages where id='${stageId}'::uuid) || '|' ||
         (select version::text from public.company_registrations where id='${regId}'::uuid) || '|' ||
         (select count(*)::text from public.registration_stage_events
            where stage_id='${stageId}'::uuid and to_stage_status='blocked') || '|' ||
         (select count(*)::text from public.registration_operation_receipts
            where scope_id='${regId}'::uuid and operation_kind='transition_stage');`,
    );
    const [status, sVer, rVer, blockedEvents, receipts] = inv.stdout.trim().split('|');
    check(status === 'blocked', 'ONE_WINNER_STAGE_BLOCKED');
    check(
      Number(sVer) === Number(stageVer) + 1 && Number(rVer) === Number(regVer) + 1,
      'ONE_WINNER_VERSIONS_BUMPED_ONCE',
    );
    check(Number(blockedEvents) === 1, 'ONE_WINNER_SINGLE_EVENT');
    check(Number(receipts) === 1, 'ONE_WINNER_SINGLE_RECEIPT');
  }

  // -------------------------------------------------------------------------
  // (b) Same-operation replay under concurrency (both callers: same op id/hash).
  //     Current stage is 'blocked' at the bumped versions -> use 'unblock'.
  // -------------------------------------------------------------------------
  {
    const cur = await psql(
      `select r.version::text || '|' || s.version::text
       from public.company_registrations r
       join public.registration_stages s on s.registration_id=r.id and s.code=r.current_stage
       where r.tenant_id=${uid(0)};`,
    );
    const [curRegVer, curStageVer] = cur.stdout.trim().split('|');

    const h = holder(
      `select ${unblockExpr(regId, stageId, curRegVer, curStageVer, uid(30), hx(30))};`,
    );
    await h.ready;
    // Contender replays the EXACT op id + hash. It blocks on the receipt scope
    // FOR UPDATE, then returns the stored receipt (replay) once holder commits.
    // Launch it, let it reach the lock, commit holder, then collect its result.
    const contenderPromise = psql(
      `select (${unblockExpr(regId, stageId, curRegVer, curStageVer, uid(30), hx(30))})::text;`,
      12000,
    );
    await new Promise((r) => setTimeout(r, 800));
    const holderResult = await h.commit();
    const contender = await contenderPromise;
    if (process.env.CONC_DEBUG) console.error('CONTENDER_B', JSON.stringify(contender));

    check(holderResult.code === 0, 'REPLAY_HOLDER_COMMITTED');
    check(
      contender.code === 0 &&
        contender.stdout.includes('registrationId') &&
        contender.stdout.includes('stageVersion'),
      'REPLAY_CONTENDER_GOT_RECEIPT',
    );

    const inv = await psql(
      `select
         (select count(*)::text from public.registration_operation_receipts
            where scope_id='${regId}'::uuid and operation_id=${uid(30)}) || '|' ||
         (select count(*)::text from public.registration_stage_events
            where stage_id='${stageId}'::uuid and operation_id=${uid(30)}) || '|' ||
         (select version::text from public.registration_stages where id='${stageId}'::uuid);`,
    );
    const [opReceipts, opEvents, finalStageVer] = inv.stdout.trim().split('|');
    check(Number(opReceipts) === 1, 'REPLAY_SINGLE_RECEIPT');
    check(Number(opEvents) === 1, 'REPLAY_SINGLE_EVENT_NO_DUP');
    check(Number(finalStageVer) === Number(curStageVer) + 1, 'REPLAY_SINGLE_VERSION_BUMP');
  }

  console.log(`CONCURRENCY_FIXTURE_TENANT=${rawUid(0)}`);
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.log(
    error instanceof Error && /^[A-Z_]+$/.test(error.message)
      ? `FAIL_${error.message}`
      : `FAIL_RUNNER_${error && error.message}`,
  );
} finally {
  for (const child of active) {
    try {
      child.stdin.end('rollback;\n');
    } catch {}
    child.kill('SIGTERM');
  }
  console.log(
    `REGISTRATION_VISA_CONCURRENCY ${failures ? 'FAIL' : 'PASS'} ` +
      `assertions=${assertions} failures=${failures}`,
  );
  process.exitCode = failures ? 1 : 0;
}
