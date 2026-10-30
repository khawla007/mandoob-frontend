\set ON_ERROR_STOP on
begin;
set local statement_timeout = '20s';
set local lock_timeout = '5s';

insert into public.tenants(id,name,slug,status) values
 ('93000000-0000-4000-8000-000000000001','Settings fixture','settings-transaction-fixture','active'),
 ('93000000-0000-4000-8000-000000000002','Other settings fixture','settings-other-fixture','active');
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('93000000-0000-4000-8000-000000000011','authenticated','authenticated','settings-pro@example.test','','{}','{}',now(),now());
insert into public.profiles(id,tenant_id,role,status,full_name)
 values('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','pro','active','Settings PRO');
insert into public.pro_profiles(profile_id) values('93000000-0000-4000-8000-000000000011');
insert into public.pro_credentials(pro_profile_id,identifier_ciphertext,identifier_hash,identifier_last4,issuing_authority,issue_date,expiry_date,state,version,submitted_at,created_by)
 values('93000000-0000-4000-8000-000000000011','synthetic-credential',repeat('9',64),'9999','Synthetic Authority',current_date-30,current_date+365,'verified',1,now(),'93000000-0000-4000-8000-000000000011');
insert into public.company_profiles(id,tenant_id,company_name,status) values
 ('93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000001','Settings company','active'),
 ('93000000-0000-4000-8000-000000000022','93000000-0000-4000-8000-000000000002','Other company','active');
insert into public.pro_company_assignments(tenant_id,company_id,pro_profile_id,assigned_by)
 values('93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000021','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000011');

create function pg_temp.settings_mutate(section text, operation_number integer, expected bigint, input jsonb, secret text default null, fingerprint text default null)
returns jsonb language sql as $$
 select public.mutate_assigned_company_settings('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000021',section,
 ('93000000-0000-4000-8000-'||lpad(operation_number::text,12,'0'))::uuid,expected,input,secret,fingerprint);
$$;
create function pg_temp.settings_expect_error(command text, expected text)
returns void language plpgsql as $$
begin
 begin
  execute command;
 exception when others then
  if sqlerrm=expected then return; end if;
  raise exception 'unexpected settings error (redacted), expected %',expected;
 end;
 raise exception 'missing expected settings error %',expected;
end;
$$;

do $$
declare
 smtp jsonb := '{"host":"smtp.example.test","port":587,"username":"fixture","from_address":"fixture@example.test","enabled":true}';
 whatsapp jsonb := '{"business_account_id":"123456","phone_number_id":"654321","enabled":true}';
 branding jsonb := '{"name":"Updated firm","logo_url":null,"favicon_url":"https://example.test/favicon.ico","primary_color":"#123456","secondary_color":null}';
 contact jsonb := '{"email_sender_name":"Firm","email_reply_to":"reply@example.test","terms_url":"https://example.test/terms","privacy_url":null}';
 result jsonb;
 replay jsonb;
 snapshot jsonb;
 section text;
 role_name text;
 rpc text;
 invalid_url text;
begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach rpc in array array['public.is_valid_company_settings_http_url(text)','public.authorize_assigned_company_settings(uuid,uuid,uuid)','public.read_assigned_company_settings(uuid,uuid,uuid)','public.mutate_assigned_company_settings(uuid,uuid,uuid,text,uuid,bigint,jsonb,text,text)'] loop
   if has_function_privilege(role_name,rpc,'execute') then raise exception 'untrusted settings execute grant'; end if;
   if not has_function_privilege('service_role',rpc,'execute') then raise exception 'service settings execute missing'; end if;
  end loop;
  if has_table_privilege(role_name,'public.company_settings_operations','select') or has_table_privilege(role_name,'public.company_settings_versions','insert') then raise exception 'untrusted settings table grant'; end if;
 end loop;
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb)',smtp),'SETTINGS_CREDENTIAL_REQUIRED');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''whatsapp'',102,0,%L::jsonb)',whatsapp),'SETTINGS_CREDENTIAL_REQUIRED');
 if exists(select 1 from public.company_settings_versions where tenant_id='93000000-0000-4000-8000-000000000001') then raise exception 'credential failure left settings version write'; end if;
 result := pg_temp.settings_mutate('smtp',101,0,smtp,'synthetic-ciphertext-one',repeat('a',64));
 replay := pg_temp.settings_mutate('smtp',101,0,smtp||'{"host":" smtp.example.test "}','different-randomized-ciphertext',repeat('a',64));
 if result <> replay or result->>'version'<>'1' then raise exception 'normalized secret replay incorrect'; end if;
 if (select password_encrypted from public.tenant_smtp_config where tenant_id='93000000-0000-4000-8000-000000000001') <> 'synthetic-ciphertext-one' then raise exception 'replay rewrote ciphertext'; end if;
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''changed'',%L)',smtp,repeat('b',64)),'SETTINGS_OPERATION_CONFLICT');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',103,0,%L::jsonb)',smtp),'STALE_SETTINGS_VERSION');
 perform pg_temp.settings_mutate('smtp',103,1,smtp||'{"username":"updated"}');
 if (select password_encrypted from public.tenant_smtp_config where tenant_id='93000000-0000-4000-8000-000000000001') <> 'synthetic-ciphertext-one' then raise exception 'blank credential failed to preserve current'; end if;
 perform pg_temp.settings_mutate('whatsapp',102,0,whatsapp,'synthetic-token-one',repeat('c',64));
 perform pg_temp.settings_mutate('whatsapp',104,1,whatsapp);
 if (select access_token_encrypted from public.tenant_whatsapp_config where tenant_id='93000000-0000-4000-8000-000000000001') <> 'synthetic-token-one' then raise exception 'blank token failed preservation'; end if;
 perform pg_temp.settings_mutate('branding',105,0,branding);
 perform pg_temp.settings_mutate('contact',106,0,contact);
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''branding'',107,1,%L::jsonb)',branding||'{"logo_url":"javascript:alert(1)"}'),'INVALID_SETTINGS_INPUT');
 foreach invalid_url in array array[
  'https://:','https://example.test:abc','https://example.test:0','https://example.test:65536',
  'https://example.test:','https://[::1','https://::1]','https://[invalid]',
  'https://[127.0.0.1]','https://[::1]:abc','https://user:password@example.test',
  'https://user@example.test','https://bad..example.test','https://-bad.example.test',
  'https://999.999.999.999','https://example.test\\@evil.test'
 ] loop
  perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''branding'',107,1,%L::jsonb)',branding||jsonb_build_object('logo_url',invalid_url)),'INVALID_SETTINGS_INPUT');
 end loop;
 foreach invalid_url in array array['http://localhost:3001/path','https://example.test:65535/path?query=value#fragment','https://127.0.0.1:443/','https://[::1]:443/','https://[2001:db8::1]/','https://[::ffff:192.0.2.1]/'] loop
  if not public.is_valid_company_settings_http_url(invalid_url) then raise exception 'valid bounded settings URL rejected'; end if;
 end loop;
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''contact'',107,1,%L::jsonb)',contact||'{"unexpected":"field"}'),'INVALID_SETTINGS_INPUT');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''contact'',107,1,%L::jsonb)',contact-'privacy_url'),'INVALID_SETTINGS_INPUT');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',107,2,%L::jsonb)',smtp||'{"enabled":null}'),'INVALID_SETTINGS_INPUT');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',107,2,%L::jsonb)',smtp||'{"port":587.5}'),'INVALID_SETTINGS_INPUT');
 snapshot := public.read_assigned_company_settings('93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000021');
 if snapshot->'versions' <> '{"branding":1,"contact":1,"smtp":2,"whatsapp":2}'::jsonb or snapshot#>>'{smtp,has_password}'<>'true' or snapshot#>>'{whatsapp,has_token}'<>'true' then raise exception 'snapshot versions/credential indicators incorrect'; end if;
 if snapshot::text ~ 'synthetic|encrypted|fingerprint' then raise exception 'settings snapshot leaked secret'; end if;
 if (select count(*) from public.tenant_audit_log where tenant_id='93000000-0000-4000-8000-000000000001' and details->>'entity'='company_settings')<>6 then raise exception 'audit/replay count incorrect'; end if;
 if exists(select 1 from public.tenant_audit_log where tenant_id='93000000-0000-4000-8000-000000000001' and details::text ~ 'synthetic|fingerprint|encrypted') then raise exception 'settings audit leaked secret'; end if;
 perform pg_temp.settings_expect_error('select public.read_assigned_company_settings(null,''93000000-0000-4000-8000-000000000001'',''93000000-0000-4000-8000-000000000021'')','FORBIDDEN');
 perform pg_temp.settings_expect_error('select public.read_assigned_company_settings(''93000000-0000-4000-8000-000000000011'',''93000000-0000-4000-8000-000000000002'',''93000000-0000-4000-8000-000000000022'')','FORBIDDEN');
 update public.tenants set status='suspended' where id='93000000-0000-4000-8000-000000000001';
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
 update public.tenants set status='active' where id='93000000-0000-4000-8000-000000000001';
 foreach section in array array['suspended','churned'] loop
  update public.company_profiles set status=section::public.company_status where id='93000000-0000-4000-8000-000000000021';
  perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
  perform pg_temp.settings_expect_error('select public.read_assigned_company_settings(''93000000-0000-4000-8000-000000000011'',''93000000-0000-4000-8000-000000000001'',''93000000-0000-4000-8000-000000000021'')','FORBIDDEN');
 end loop;
 update public.company_profiles set status='active' where id='93000000-0000-4000-8000-000000000021';
 update public.pro_credentials set state='revoked' where pro_profile_id='93000000-0000-4000-8000-000000000011';
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
 update public.pro_credentials set state='verified' where pro_profile_id='93000000-0000-4000-8000-000000000011';
 update public.pro_company_assignments set status='released',released_at=now(),released_by='93000000-0000-4000-8000-000000000011',release_reason='Fixture release' where pro_profile_id='93000000-0000-4000-8000-000000000011';
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
 update public.profiles set status='disabled' where id='93000000-0000-4000-8000-000000000011';
 -- Restore the ledger after changing the actor while released. This intentionally
 -- inconsistent fixture isolates the reusable RPC's actor-status defense without
 -- disabling the normal profile-transition guard or masking it with assignment loss.
 update public.pro_company_assignments set status='active',released_at=null,released_by=null,release_reason=null where pro_profile_id='93000000-0000-4000-8000-000000000011';
 perform pg_temp.settings_expect_error('select public.read_assigned_company_settings(''93000000-0000-4000-8000-000000000011'',''93000000-0000-4000-8000-000000000001'',''93000000-0000-4000-8000-000000000021'')','FORBIDDEN');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
 -- Independently isolate wrong role: actor active, credential current, exact
 -- company/tenant active, and assignment active at the authorization boundary.
 update public.pro_company_assignments set status='released',released_at=now(),released_by='93000000-0000-4000-8000-000000000011',release_reason='Fixture role transition' where pro_profile_id='93000000-0000-4000-8000-000000000011';
 update public.profiles set status='active',role='customer' where id='93000000-0000-4000-8000-000000000011';
 update public.pro_company_assignments set status='active',released_at=null,released_by=null,release_reason=null where pro_profile_id='93000000-0000-4000-8000-000000000011';
 perform pg_temp.settings_expect_error('select public.read_assigned_company_settings(''93000000-0000-4000-8000-000000000011'',''93000000-0000-4000-8000-000000000001'',''93000000-0000-4000-8000-000000000021'')','FORBIDDEN');
 perform pg_temp.settings_expect_error(format('select pg_temp.settings_mutate(''smtp'',101,0,%L::jsonb,''replacement'',%L)',smtp,repeat('a',64)),'FORBIDDEN');
 update public.pro_company_assignments set status='released',released_at=now(),released_by='93000000-0000-4000-8000-000000000011',release_reason='Fixture role restoration' where pro_profile_id='93000000-0000-4000-8000-000000000011';
 update public.profiles set role='pro' where id='93000000-0000-4000-8000-000000000011';
 update public.pro_company_assignments set status='active',released_at=null,released_by=null,release_reason=null where pro_profile_id='93000000-0000-4000-8000-000000000011';
end;
$$;

-- Deliberately fail the required audit write: settings/config/version/replay must
-- roll back together. The fixture uses a trigger only inside its own transaction.
update public.profiles set status='active' where id='93000000-0000-4000-8000-000000000011';
update public.pro_company_assignments set status='active',released_at=null,released_by=null,release_reason=null where pro_profile_id='93000000-0000-4000-8000-000000000011';
create function pg_temp.settings_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_AUDIT_FAILURE'; end; $$;
create trigger settings_fixture_fail_audit before insert on public.tenant_audit_log for each row execute function pg_temp.settings_fail_audit();
select pg_temp.settings_expect_error('select pg_temp.settings_mutate(''contact'',108,1,''{"email_sender_name":"must roll back","email_reply_to":null,"terms_url":null,"privacy_url":null}'')','FIXTURE_AUDIT_FAILURE');
do $$ begin
 if (select email_sender_name from public.tenants where id='93000000-0000-4000-8000-000000000001')<>'Firm'
 or (select version from public.company_settings_versions where tenant_id='93000000-0000-4000-8000-000000000001' and section='contact')<>1
 or exists(select 1 from public.company_settings_operations where operation_id='93000000-0000-4000-8000-000000000108') then raise exception 'audit failure did not roll back settings transaction'; end if;
end; $$;
rollback;
