// P3.08 two-session concurrency proof against a disposable local stack.
// Usage: P308_DB_CONTAINER=supabase_db_<project> node p308_employees_renewals_concurrency.mjs
// Each run uses a fresh random fixture namespace because P3.08 history rows
// are immutable and cannot be torn down.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const container = process.env.P308_DB_CONTAINER;
if (!container) throw new Error('P308_DB_CONTAINER is required');
const run = randomBytes(2).toString('hex');
const id = (n) => `'9308${run}-0000-4000-8000-${String(n).padStart(12, '0')}'::uuid`;
const hash = (label) => `encode(sha256(convert_to('${run}:${label}','UTF8')),'hex')`;
let assertions = 0;
let failures = 0;

function session(sql) {
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
      'postgres',
      '-X',
      '-q',
      '-A',
      '-t',
      '--set=ON_ERROR_STOP=1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const done = new Promise((resolve) =>
    child.on('close', (code) =>
      resolve({
        code,
        get stdout() {
          return stdout;
        },
        get stderr() {
          return stderr;
        },
      }),
    ),
  );
  child.stdin.end(sql);
  return { child, done, output: () => stdout };
}

async function exec(sql) {
  const result = await session(sql).done;
  if (result.code !== 0) throw new Error(`SQL_FAILED ${result.stderr}`);
  return result.stdout.trim();
}

async function waitFor(check, label) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 15_000) throw new Error(`TIMEOUT ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function assert(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label}`);
  } else {
    console.log(`ok ${label}`);
  }
}

// Holder runs `holderSql` in an open transaction, signals READY, sleeps, commits.
async function race(label, holderSql, contenderSql) {
  const holder = session(
    `begin;\nset local role service_role;\n${holderSql};\nreset role;\nselect 'READY';\nselect pg_sleep(1.5);\ncommit;\n`,
  );
  await waitFor(() => holder.output().includes('READY'), label);
  const contender = session(`set role service_role;\n${contenderSql};\n`);
  const [h, c] = await Promise.all([holder.done, contender.done]);
  if (h.code !== 0) throw new Error(`HOLDER_FAILED ${label} ${h.stderr}`);
  return c;
}

const setup = `
begin;
insert into public.tenants(id, slug, name) values (${id(100)}, 'p308-race-${run}', 'Race ${run}');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('9308${run}-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'p308-race-${run}-' || n || '@example.invalid', '', now(), '{}', '{}', now(), now()
from generate_series(1, 2) n;
insert into public.profiles(id, tenant_id, role, status) values
  (${id(1)}, null, 'pro', 'active'), (${id(2)}, null, 'admin', 'active');
insert into public.pro_profiles(profile_id) values (${id(1)});
insert into public.pro_credentials(pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by)
values (${id(1)}, 'synthetic', ${hash('cred')}, '9999', 'Synthetic Authority', current_date - 1,
  current_date + 365, 'verified', 2, now(), ${id(1)});
insert into public.company_profiles(id, tenant_id, company_name) values (${id(101)}, ${id(100)}, 'Race ${run}');
insert into public.pro_company_assignments(tenant_id, company_id, pro_profile_id, assigned_by)
values (${id(100)}, ${id(101)}, ${id(1)}, ${id(2)});
commit;
`;

const emp = (name, passport) => `jsonb_build_object('name','${name}',
  'passport_no_encrypted','cipher:${passport}','passport_no_hash',${hash(passport)},'passport_no_last4','${passport.slice(-4)}')`;
const call = (fn, op, args) =>
  `select public.${fn}(${id(1)}, ${id(op)}, ${hash(`op${op}`)}, ${id(100)}, ${id(101)}, ${args})`;

await exec(setup);

// 1. Passport uniqueness race: concurrent creates with one passport.
{
  const c = await race(
    'passport',
    call('p308_create_employee', 900, emp('Race One', 'RACE0001')),
    call('p308_create_employee', 901, emp('Race Two', 'RACE0001')),
  );
  const count = await exec(
    `select count(*) from public.employees where company_id = ${id(101)} and passport_no_hash = ${hash('RACE0001')}`,
  );
  assert(
    c.code !== 0 && c.stderr.includes('EMPLOYEE_PASSPORT_DUPLICATE') && count === '1',
    'PASSPORT_RACE_ONE_WINNER',
  );
}

// 2. Simultaneous employee edits from the same version.
const employeeId = await exec(
  `select id from public.employees where company_id = ${id(101)} and name = 'Race One'`,
);
{
  const c = await race(
    'edit',
    call('p308_update_employee', 902, `'${employeeId}'::uuid, 1, '{"job_title":"Holder"}'`),
    call('p308_update_employee', 903, `'${employeeId}'::uuid, 1, '{"job_title":"Contender"}'`),
  );
  const row = await exec(
    `select job_title || ':' || version from public.employees where id = '${employeeId}'`,
  );
  assert(
    c.code !== 0 && c.stderr.includes('STALE_VERSION') && row === 'Holder:2',
    'EMPLOYEE_EDIT_RACE_STALE_LOSER',
  );
}

// 3. Same operation id submitted twice concurrently: one row, identical receipt.
{
  const payload = `jsonb_build_object('type','visa','label','Race visa','due_date',(current_date + 40)::text)`;
  const c = await race(
    'same-op',
    call('p308_create_renewal', 904, payload),
    call('p308_create_renewal', 904, payload),
  );
  const count = await exec(
    `select count(*) from public.renewals where company_id = ${id(101)} and label = 'Race visa'`,
  );
  assert(
    c.code === 0 && c.stdout.includes('"replayed": true') && count === '1',
    'SAME_OPERATION_SINGLE_EFFECT',
  );
}

// 4. Stale renewal transitions from the same version.
const renewalId = await exec(
  `select id from public.renewals where company_id = ${id(101)} and label = 'Race visa'`,
);
{
  const c = await race(
    'transition',
    call('p308_transition_renewal', 905, `'${renewalId}'::uuid, 1, 'in_progress', null, null`),
    call(
      'p308_transition_renewal',
      906,
      `'${renewalId}'::uuid, 1, 'cancelled', null, 'duplicate_entry'`,
    ),
  );
  const row = await exec(
    `select stage || ':' || version from public.renewals where id = '${renewalId}'`,
  );
  const events = await exec(
    `select count(*) from public.renewal_stage_events where renewal_id = '${renewalId}'`,
  );
  assert(
    c.code !== 0 && c.stderr.includes('STALE_VERSION') && row === 'in_progress:2' && events === '2',
    'RENEWAL_TRANSITION_RACE',
  );
}

// 5. Import cancel racing a batch: cancel holds the job lock, batch sees the fence.
{
  const jobId = id(700);
  const path = `'${id(100).slice(1, 37)}/${id(101).slice(1, 37)}/${id(700).slice(1, 37)}.csv.enc'`;
  await exec(`set role service_role;
    ${call('p308_register_import', 910, `${jobId}, ${path}, ${hash('artifact')}, 64`)};
    ${call('p308_record_import_validation', 911, `${jobId}, 1, 2, 0, '[]'::jsonb`)};
    ${call('p308_request_import_execution', 912, `${jobId}, 2`)};`);
  const lease = await exec(
    `set role service_role; select lease_token from public.claim_event_jobs(${id(990)}, 'p308.employee_import.executor', 50, 60) c where c.payload->>'resource_id' = ${jobId}::text;`,
  );
  const batch = `select public.p308_apply_import_batch(${jobId}, ${id(990)}, '${lease}'::uuid, 0, 1,
    jsonb_build_array(jsonb_build_object('row_number',1,'outcome','valid','employee',${emp('Imported', 'IMPT0001')})))`;
  const c = await race('cancel-batch', call('p308_cancel_import', 913, `${jobId}, 3`), batch);
  const state = await exec(
    `select next_row || ':' || (cancel_requested_at is not null) from public.bulk_import_jobs where id = ${jobId}`,
  );
  assert(
    c.code === 0 && c.stdout.includes('cancel_requested') && state === '0:true',
    'IMPORT_CANCEL_BATCH_RACE_FENCED',
  );

  // 6. Duplicate batch delivery after a crash: the replayed batch is a no-op.
  const job2 = id(710);
  const path2 = `'${id(100).slice(1, 37)}/${id(101).slice(1, 37)}/${id(710).slice(1, 37)}.csv.enc'`;
  await exec(`set role service_role;
    ${call('p308_register_import', 920, `${job2}, ${path2}, ${hash('artifact2')}, 64`)};
    ${call('p308_record_import_validation', 921, `${job2}, 1, 1, 0, '[]'::jsonb`)};
    ${call('p308_request_import_execution', 922, `${job2}, 2`)};`);
  const lease2 = await exec(
    `set role service_role; select lease_token from public.claim_event_jobs(${id(991)}, 'p308.employee_import.executor', 50, 60) c where c.payload->>'resource_id' = ${job2}::text;`,
  );
  const batch2 = `select public.p308_apply_import_batch(${job2}, ${id(991)}, '${lease2}'::uuid, 0, 1,
    jsonb_build_array(jsonb_build_object('row_number',1,'outcome','valid','employee',${emp('Imported Two', 'IMPT0002')})))`;
  const c2 = await race('duplicate-batch', batch2, batch2);
  const rows = await exec(
    `select count(*) from public.bulk_import_row_outcomes where job_id = ${job2}`,
  );
  assert(
    c2.code === 0 && c2.stdout.includes('replayed') && rows === '1',
    'IMPORT_DUPLICATE_BATCH_NOOP',
  );
}

console.log(
  `P308_CONCURRENCY ${failures === 0 ? 'PASS' : 'FAIL'} assertions=${assertions} failures=${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
