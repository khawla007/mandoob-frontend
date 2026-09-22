// Independent actual-RPC race checks. Never reset or migrate a database.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const container = process.env.P303_TEST_DB_CONTAINER;
const approvedContainer =
  container === 'supabase_db_mandoob-p303-QHFx6rlv' ||
  (process.env.P303_ALLOW_COMBINED_FIXTURE === '1' &&
    /^supabase_db_mandoob-p303-combined-[A-Za-z0-9]+$/.test(container ?? ''));
assert.equal(approvedContainer, true, 'Exact dedicated database required');
const id = (n) => `95050000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actorA = id(1),
  actorB = id(2),
  pro = id(3),
  tenant = id(4),
  company = id(5);
const args = [
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
function sql(input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}
const json = (input) => JSON.parse(sql(input));
function worker(input, onReady) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let output = '',
      called = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Worker exceeded 15 seconds'));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (!called && output.includes('RPC_A_COMMITTED_PENDING')) {
        called = true;
        onReady?.();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (exit) => {
      clearTimeout(timer);
      resolve({ exit, output });
    });
    child.stdin.end(input);
  });
}
function rpc(fn, actor, version, op, payload = {}, hash = 'a') {
  return `select public.${fn}('${actor}','${tenant}','${company}',${version},'${id(op)}',repeat('${hash}',64),'${JSON.stringify(payload).replaceAll("'", "''")}'::jsonb);`;
}
const legal = {
  complete_section: true,
  company_name: 'Independent Race LLC',
  display_name: 'Independent Race',
  jurisdiction_type: 'mainland',
  licensing_authority: 'Dubai Economy',
  legal_structure: 'limited_liability_company',
  trade_license_no: 'RACE-9505',
  license_expiry: '2030-12-31',
};
const lifecycleAudit =
  "action in ('company_onboarding_section_completed','company_onboarding_section_saved','company_onboarding_section_reopened','company_onboarding_submitted','company_activation_attempted','company_activated')";
function snapshot() {
  return json(
    `select jsonb_build_object('version',c.onboarding_version,'status',c.status,'onboarding',c.onboarding_status,'tenant',(select status from public.tenants where id='${tenant}'),'operations',(select count(*) from public.company_onboarding_operations where company_id=c.id),'audits',(select count(*) from public.tenant_audit_log where tenant_id='${tenant}' and ${lifecycleAudit}),'legal',(select status from public.company_onboarding_sections where company_id=c.id and section_key='legal')) from public.company_profiles c where c.id='${company}';`,
  );
}
async function contend(label, first, second, secondStale) {
  let ready;
  const gate = new Promise((resolve) => {
    ready = resolve;
  });
  const a = worker(
    `set application_name='p303-independent-a'; begin; set statement_timeout='10s'; ${first} select 'RPC_A_COMMITTED_PENDING'; select pg_sleep(3); commit;`,
    ready,
  );
  await Promise.race([
    gate,
    a.then((r) => {
      throw new Error(`A failed before RPC marker: ${r.output}`);
    }),
  ]);
  const b = worker(
    `\\set VERBOSITY verbose\nset application_name='p303-independent-b'; begin; set statement_timeout='10s'; ${second} commit;`,
  );
  let blocked = false;
  for (let i = 0; i < 20; i++) {
    blocked =
      sql(
        "select exists(select 1 from pg_stat_activity b join pg_stat_activity a on a.pid=any(pg_blocking_pids(b.pid)) where b.application_name='p303-independent-b' and a.application_name='p303-independent-a');",
      ) === 't';
    if (blocked) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const results = await Promise.all([a, b]);
  assert.ok(blocked, `${label}: no actual RPC blocking observed`);
  assert.equal(results[0].exit, 0, results[0].output);
  if (secondStale) {
    assert.notEqual(results[1].exit, 0, `${label}: stale second RPC committed`);
    assert.match(results[1].output, /STALE_ONBOARDING_VERSION/);
  } else {
    assert.equal(results[1].exit, 0, results[1].output);
    const resultA = results[0].output.split('\n').find((line) => line.startsWith('{'));
    const resultB = results[1].output.split('\n').find((line) => line.startsWith('{'));
    assert.deepEqual(JSON.parse(resultA), JSON.parse(resultB), `${label}: replay result differs`);
  }
  console.log(`PASS ${label}: actual blocking and expected committed/stale/replayed RPC outcomes`);
}
function cleanCompany() {
  sql(
    `begin;
     set constraints all deferred;
     alter table public.event_job_attempts disable trigger event_job_attempts_immutable;
     alter table public.event_replay_requests disable trigger event_replay_requests_immutable;
     alter table public.domain_events disable trigger domain_events_immutable;
     update public.event_jobs set replay_request_id=null where event_id in
       (select id from public.domain_events where tenant_id='${tenant}' and company_id='${company}');
     delete from public.event_job_attempts where job_id in
       (select id from public.event_jobs where event_id in
         (select id from public.domain_events where tenant_id='${tenant}' and company_id='${company}'));
     delete from public.event_replay_requests where source_job_id in
       (select id from public.event_jobs where event_id in
         (select id from public.domain_events where tenant_id='${tenant}' and company_id='${company}'));
     delete from public.event_jobs where event_id in
       (select id from public.domain_events where tenant_id='${tenant}' and company_id='${company}');
     delete from public.domain_events where tenant_id='${tenant}' and company_id='${company}';
     alter table public.event_job_attempts enable trigger event_job_attempts_immutable;
     alter table public.event_replay_requests enable trigger event_replay_requests_immutable;
     alter table public.domain_events enable trigger domain_events_immutable;
     delete from public.pro_company_assignments where company_id='${company}' and pro_profile_id='${pro}';
     update public.profiles set tenant_id=null where id='${pro}';
     delete from public.tenant_audit_log where tenant_id='${tenant}';
     delete from public.company_profiles where id='${company}';
     delete from public.tenants where id='${tenant}';
     commit;`,
  );
}
function setupCompany() {
  sql(
    `insert into public.tenants(id,name,slug,plan,status) values('${tenant}','Independent Race','independent-race-9505','starter','pending'); insert into public.company_profiles(id,tenant_id,company_name,status) values('${company}','${tenant}','Independent Race LLC','onboarding');`,
  );
}
function makeReady() {
  sql(`update public.company_profiles set jurisdiction_type='mainland',licensing_authority='Dubai Economy',legal_structure='limited_liability_company',trade_license_no='RACE-9505',license_expiry='2030-12-31',establishment_card_no_encrypted='synthetic',establishment_card_no_hash=repeat('e',64),establishment_card_no_last4='9505',establishment_card_expiry='2030-12-31' where id='${company}';
    update public.company_onboarding_sections set status='complete',completed_at=now(),completed_by_profile_id='${actorA}' where company_id='${company}';
    insert into public.company_shareholders(tenant_id,company_id,kind,full_name,nationality_code,ownership_percent,sort_order) values('${tenant}','${company}','individual','Synthetic Owner','AE',100,0);
    insert into public.company_registered_activities(tenant_id,company_id,activity_code,activity_name,authority_name,is_primary,sort_order) values('${tenant}','${company}','RACE','Synthetic Activity','Dubai Economy',true,0);
    insert into public.company_office_details(tenant_id,company_id,office_type,provider_name,city,emirate) values('${tenant}','${company}','virtual','Synthetic Offices','Dubai','Dubai');
    insert into public.company_bank_details(tenant_id,company_id,bank_name,account_holder_name,currency_code,swift_bic,iban_encrypted,iban_hash,iban_last4) values('${tenant}','${company}','Synthetic Bank','Independent Race LLC','AED','ABCDEFGH','synthetic',repeat('f',64),'9505');
    insert into public.pro_company_assignments(tenant_id,company_id,pro_profile_id,assigned_by) values('${tenant}','${company}','${pro}','${actorA}'); update public.profiles set tenant_id='${tenant}' where id='${pro}';`);
  assert.equal(
    sql(`select count(*) from public.evaluate_company_activation_readiness('${company}');`),
    '0',
    'Fixture is not activation-ready',
  );
}
// Run this harness serially: this preflight is not an atomic fixture reservation.
// Abort outside cleanup when a serialized invocation finds reserved resources.
assert.equal(
  sql(`select
    (select count(*) from auth.users where id in ('${actorA}','${actorB}','${pro}')) +
    (select count(*) from public.profiles where id in ('${actorA}','${actorB}','${pro}')) +
    (select count(*) from public.pro_credentials where id='${id(6)}' or pro_profile_id='${pro}') +
    (select count(*) from public.tenants where id='${tenant}') +
    (select count(*) from public.company_profiles where id='${company}') +
    (select count(*) from public.pro_company_assignments where company_id='${company}' or pro_profile_id='${pro}') +
    (select count(*) from public.company_onboarding_operations where company_id='${company}') +
    (select count(*) from public.tenant_audit_log where tenant_id='${tenant}') +
    (select count(*) from public.domain_events where tenant_id='${tenant}' or company_id='${company}') +
    (select count(*) from pg_stat_activity where application_name in ('p303-independent-a','p303-independent-b'));`),
  '0',
  'Reserved fixture/worker collision: refusing setup and cleanup',
);
try {
  sql(
    `begin; insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) select x.id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x.email,'',now(),'{}','{}',now(),now() from (values('${actorA}'::uuid,'p303-race-a@example.invalid'),('${actorB}'::uuid,'p303-race-b@example.invalid'),('${pro}'::uuid,'p303-race-pro@example.invalid')) x(id,email); insert into public.profiles(id,role,status,full_name) values('${actorA}','super_admin','active','Synthetic Race A'),('${actorB}','admin','active','Synthetic Race B'),('${pro}','pro','active','Synthetic Race PRO'); insert into public.pro_profiles(profile_id) values('${pro}'); insert into public.pro_credentials(id,pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by) values('${id(6)}','${pro}','synthetic',repeat('d',64),'9505','Synthetic Authority',current_date-30,current_date+365,'verified',5,now(),'${actorA}'); commit;`,
  );
  setupCompany();
  await contend(
    'two active operators legal save same version/distinct operations',
    rpc('save_company_legal_section', actorA, 0, 10, legal),
    rpc('save_company_legal_section', actorB, 0, 11, legal, 'b'),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 1,
    status: 'onboarding',
    onboarding: 'in_progress',
    tenant: 'pending',
    operations: 1,
    audits: 1,
    legal: 'complete',
  });
  assert.equal(
    sql(
      `select actor_id from public.tenant_audit_log where tenant_id='${tenant}' and ${lifecycleAudit};`,
    ),
    actorA,
  );
  cleanCompany();
  setupCompany();
  await contend(
    'identical legal operation concurrent replay',
    rpc('save_company_legal_section', actorA, 0, 20, legal),
    rpc('save_company_legal_section', actorA, 0, 20, legal),
    false,
  );
  assert.equal(snapshot().version, 1);
  assert.equal(snapshot().operations, 1);
  assert.equal(snapshot().audits, 1);
  cleanCompany();
  setupCompany();
  makeReady();
  await contend(
    'submit versus reopen same version',
    rpc('submit_company_onboarding_for_activation', actorA, 0, 30),
    rpc(
      'reopen_company_onboarding_section',
      actorB,
      0,
      31,
      { section: 'legal', reason: 'Synthetic contention' },
      'b',
    ),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 1,
    status: 'onboarding',
    onboarding: 'ready_for_activation',
    tenant: 'pending',
    operations: 1,
    audits: 1,
    legal: 'complete',
  });
  await contend(
    'activation versus reopen same version',
    rpc('activate_company_onboarding', actorA, 1, 40),
    rpc(
      'reopen_company_onboarding_section',
      actorB,
      1,
      41,
      { section: 'legal', reason: 'Synthetic contention' },
      'b',
    ),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 2,
    status: 'active',
    onboarding: 'completed',
    tenant: 'active',
    operations: 2,
    audits: 3,
    legal: 'complete',
  });
  cleanCompany();
  setupCompany();
  makeReady();
  sql(rpc('submit_company_onboarding_for_activation', actorA, 0, 50));
  await contend(
    'identical activation operation concurrent replay',
    rpc('activate_company_onboarding', actorA, 1, 51),
    rpc('activate_company_onboarding', actorA, 1, 51),
    false,
  );
  assert.deepEqual(snapshot(), {
    version: 2,
    status: 'active',
    onboarding: 'completed',
    tenant: 'active',
    operations: 2,
    audits: 3,
    legal: 'complete',
  });
  cleanCompany();
  setupCompany();
  makeReady();
  await contend(
    'reopen versus submit same version',
    rpc('reopen_company_onboarding_section', actorB, 0, 60, {
      section: 'legal',
      reason: 'Synthetic contention',
    }),
    rpc('submit_company_onboarding_for_activation', actorA, 0, 61, {}, 'b'),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 1,
    status: 'onboarding',
    onboarding: 'in_progress',
    tenant: 'pending',
    operations: 1,
    audits: 1,
    legal: 'incomplete',
  });
  cleanCompany();
  setupCompany();
  makeReady();
  sql(rpc('submit_company_onboarding_for_activation', actorA, 0, 70));
  await contend(
    'reopen versus activation same version',
    rpc('reopen_company_onboarding_section', actorB, 1, 71, {
      section: 'legal',
      reason: 'Synthetic contention',
    }),
    rpc('activate_company_onboarding', actorA, 1, 72, {}, 'b'),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 2,
    status: 'onboarding',
    onboarding: 'in_progress',
    tenant: 'pending',
    operations: 2,
    audits: 2,
    legal: 'incomplete',
  });
  cleanCompany();
  setupCompany();
  makeReady();
  sql(rpc('submit_company_onboarding_for_activation', actorA, 0, 80));
  await contend(
    'two operators activation same version/distinct operations',
    rpc('activate_company_onboarding', actorA, 1, 81),
    rpc('activate_company_onboarding', actorB, 1, 82, {}, 'b'),
    true,
  );
  assert.deepEqual(snapshot(), {
    version: 2,
    status: 'active',
    onboarding: 'completed',
    tenant: 'active',
    operations: 2,
    audits: 3,
    legal: 'complete',
  });
  console.log(
    'PASS all 8 cases: state/version, audit cardinality, operation receipt cardinality, replay equality, and actual RPC contention',
  );
} finally {
  cleanCompany();
  sql(
    `delete from public.pro_credentials where id='${id(6)}'; delete from public.pro_profiles where profile_id='${pro}'; delete from public.profiles where id in('${actorA}','${actorB}','${pro}'); delete from auth.users where id in('${actorA}','${actorB}','${pro}');`,
  );
  assert.equal(
    sql(`select count(*) from auth.users where id in('${actorA}','${actorB}','${pro}');`),
    '0',
  );
  assert.equal(sql(`select count(*) from public.company_profiles where id='${company}';`), '0');
  assert.equal(sql(`select count(*) from public.tenants where id='${tenant}';`), '0');
  assert.equal(
    sql(`select count(*) from public.company_onboarding_operations where company_id='${company}';`),
    '0',
  );
  assert.equal(
    sql(`select count(*) from public.tenant_audit_log where tenant_id='${tenant}';`),
    '0',
  );
  console.log('PASS exact synthetic fixture cleanup');
}
