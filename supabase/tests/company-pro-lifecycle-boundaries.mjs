// Run only against an explicitly approved dedicated local PostgreSQL container.
// No reset/migration; synthetic fixtures are removed in finally.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const container = process.env.P303_TEST_DB_CONTAINER;
assert.ok(
  container?.startsWith('supabase_db_mandoob-p303-'),
  'Dedicated P3.03 test container required',
);
const actor = '94030000-0000-4000-8000-000000000001';
const credential = '94030000-0000-4000-8000-000000000002';
const tenant = '94030000-0000-4000-8000-000000000003';
const company = '94030000-0000-4000-8000-000000000004';
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];
function sql(input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function worker(input, ready) {
  return new Promise((resolve) => {
    const child = spawn('docker', args);
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('PROFILE_LOCKED')) ready?.();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (exit) => resolve({ exit, output }));
    child.stdin.end(input);
  });
}

sql(
  `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('${actor}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p303-boundary@example.invalid','',now(),'{}','{}',now(),now()); insert into public.profiles(id,role,status,full_name) values('${actor}','pro','active','Synthetic boundary fixture'); insert into public.pro_profiles(profile_id) values('${actor}'); insert into public.pro_credentials(id,pro_profile_id,state,version,created_by) values('${credential}','${actor}','draft',0,'${actor}');`,
);
try {
  let ready;
  const profileLocked = new Promise((resolve) => {
    ready = resolve;
  });
  const submit = worker(
    `\\set VERBOSITY verbose\nbegin; set statement_timeout='10s'; select id from public.profiles where id='${actor}' for update; select 'PROFILE_LOCKED'; select pg_sleep(1); select public.submit_pro_credential('${actor}','${credential}',0,'94030000-0000-4000-8000-000000000010',repeat('a',64)); rollback;`,
    ready,
  );
  await profileLocked;
  const prepare = worker(
    `\\set VERBOSITY verbose\nbegin; set statement_timeout='10s'; select public.prepare_pro_credential_evidence_upload('${actor}','${credential}',0,'94030000-0000-4000-8000-000000000011',repeat('b',64),'94030000-0000-4000-8000-000000000011','pro-credentials/${actor}/${credential}/94030000-0000-4000-8000-000000000011','application/pdf',8,repeat('c',64),'proof.pdf','synthetic',now()); rollback;`,
  );
  const races = await Promise.all([submit, prepare]);
  assert.ok(
    races.every((result) => !result.output.includes('40P01')),
    'Actual submit/prepare RPC lock order deadlocked',
  );
  assert.ok(
    races.every((result) => !result.output.includes('57014')),
    'RPC lock order timed out',
  );
  // Draft fixtures may legitimately fail evidence-required domain validation.
  assert.ok(
    races.every((result) => result.exit === 0 || /P0001/.test(result.output)),
    'Unexpected RPC failure',
  );
  sql(
    `begin; update public.profiles set role='admin' where id='${actor}'; insert into public.tenants(id,name,slug,plan,status) values('${tenant}','Synthetic fixture','p303-boundary-inactive','starter','suspended'); insert into public.company_profiles(id,tenant_id,company_name,status) values('${company}','${tenant}','Synthetic fixture','suspended'); do $$ begin perform public.read_company_onboarding('${actor}','${tenant}','${company}'); raise exception 'INACTIVE_READ_RETURNED'; exception when sqlstate 'P0001' then if sqlerrm <> 'COMPANY_NOT_FOUND' then raise; end if; end $$; update public.tenants set status='active' where id='${tenant}'; do $$ begin perform public.read_company_onboarding('${actor}','${tenant}','${company}'); raise exception 'SUSPENDED_COMPANY_RETURNED'; exception when sqlstate 'P0001' then if sqlerrm <> 'COMPANY_NOT_FOUND' then raise; end if; end $$; update public.company_profiles set status='churned' where id='${company}'; do $$ begin perform public.read_company_onboarding('${actor}','${tenant}','${company}'); raise exception 'CHURNED_COMPANY_RETURNED'; exception when sqlstate 'P0001' then if sqlerrm <> 'COMPANY_NOT_FOUND' then raise; end if; end $$; update public.company_profiles set status='onboarding' where id='${company}'; update public.tenants set status='pending' where id='${tenant}'; select public.read_company_onboarding('${actor}','${tenant}','${company}'); update public.tenants set status='unassigned' where id='${tenant}'; select public.read_company_onboarding('${actor}','${tenant}','${company}'); rollback;`,
  );
  sql(
    `begin; update public.profiles set role='admin' where id='${actor}'; insert into public.tenants(id,name,slug,plan,status) values('${tenant}','Synthetic fixture','p303-boundary-inactive','starter','active'); insert into public.company_profiles(id,tenant_id,company_name,status) values('${company}','${tenant}','Synthetic fixture','renewal_due'); select public.read_company_onboarding('${actor}','${tenant}','${company}'); update public.company_profiles set status='renewal_overdue' where id='${company}'; select public.read_company_onboarding('${actor}','${tenant}','${company}'); rollback;`,
  );
  console.log(
    'PASS: actual submit/prepare RPC ordering and inactive onboarding/setup/renewal compatibility',
  );
} finally {
  sql(
    `delete from public.pro_credentials where id='${credential}'; delete from public.pro_profiles where profile_id='${actor}'; delete from public.profiles where id='${actor}'; delete from auth.users where id='${actor}';`,
  );
}
