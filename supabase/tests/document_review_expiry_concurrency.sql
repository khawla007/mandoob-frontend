\set ON_ERROR_STOP on
\set QUIET on
set statement_timeout = '20s';
begin;

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('99030771-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create temp table assertions(label text primary key);
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception '%', label; end if;
  insert into pg_temp.assertions values(label);
end;
$$;

insert into public.tenants(id,slug,name)
values(pg_temp.uid(100),'review-expiry-fixture','Review expiry fixture');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.uid(n),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'review-expiry-'||n||'@example.invalid','',now(),'{}','{}',now(),now()
from generate_series(1,2) n;
insert into public.profiles(id,tenant_id,role,status) values
  (pg_temp.uid(1),null,'pro','active'),
  (pg_temp.uid(2),null,'admin','active');
insert into public.pro_profiles(profile_id) values(pg_temp.uid(1));
insert into public.company_profiles(id,tenant_id,company_name)
values(pg_temp.uid(101),pg_temp.uid(100),'Review expiry company');
insert into public.pro_company_assignments(
  id,tenant_id,company_id,pro_profile_id,assigned_by
) values(pg_temp.uid(10),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(1),pg_temp.uid(2));

insert into public.documents(
  id,tenant_id,company_id,doc_type,label
) values
  (pg_temp.uid(200),pg_temp.uid(100),pg_temp.uid(101),'passport','Passport'),
  (pg_temp.uid(201),pg_temp.uid(100),pg_temp.uid(101),'trade_license','Trade licence');
insert into public.document_versions(
  id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by
) values
  (pg_temp.uid(300),pg_temp.uid(200),pg_temp.uid(100),'fixture/review-one.pdf','application/pdf',4,repeat('a',64),pg_temp.uid(1)),
  (pg_temp.uid(301),pg_temp.uid(201),pg_temp.uid(100),'fixture/licence.pdf','application/pdf',4,repeat('b',64),pg_temp.uid(1));
update public.documents set current_version_id=case id
  when pg_temp.uid(200) then pg_temp.uid(300) else pg_temp.uid(301) end
where id in (pg_temp.uid(200),pg_temp.uid(201));

set local role service_role;
select * from public.review_document_version(
  pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(200),pg_temp.uid(300),
  pg_temp.uid(300),'pending','approved','Readable'
);
reset role;
select pg_temp.check(
  (select review_status='approved' and reviewed_by=pg_temp.uid(1) and reviewed_at is not null
    and review_note='Readable' from public.document_versions where id=pg_temp.uid(300))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'version_id'=pg_temp.uid(300)::text),
  'REVIEW_WINNER_PROVENANCE'
);

set local role service_role;
do $$ begin
  begin
    perform public.review_document_version(
      pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(200),pg_temp.uid(300),
      pg_temp.uid(300),'pending','rejected','Different decision');
    raise exception using errcode='ZT001',message='UNEXPECTED_REPEAT';
  exception when sqlstate 'MD409' then null; when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(
  (select review_status='approved' and review_note='Readable'
    from public.document_versions where id=pg_temp.uid(300))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'version_id'=pg_temp.uid(300)::text),
  'REPEATED_REVIEW_NO_FRAGMENTS'
);

insert into public.document_versions(
  id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by
) values(pg_temp.uid(302),pg_temp.uid(200),pg_temp.uid(100),'fixture/review-two.pdf',
  'application/pdf',4,repeat('c',64),pg_temp.uid(1));
update public.documents set current_version_id=pg_temp.uid(302) where id=pg_temp.uid(200);
set local role service_role;
do $$ begin
  begin
    perform public.review_document_version(
      pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(200),pg_temp.uid(300),
      pg_temp.uid(300),'pending','approved',null);
    raise exception using errcode='ZT001',message='UNEXPECTED_STALE_HEAD';
  exception when sqlstate 'MD409' then null; when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(
  (select review_status='pending' from public.document_versions where id=pg_temp.uid(302))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details ? 'review_status'),
  'SUPERSEDED_HEAD_NO_FRAGMENTS'
);

set local role service_role;
select * from public.set_pro_document_expiry(
  pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(200),pg_temp.uid(302),
  null,'2027-08-13'
);
do $$ begin
  begin
    perform public.set_pro_document_expiry(
      pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(200),pg_temp.uid(302),
      null,'2028-08-13');
    raise exception using errcode='ZT001',message='UNEXPECTED_STALE_EXPIRY';
  exception when sqlstate 'MD409' then null; when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(
  (select expires_on='2027-08-13' from public.documents where id=pg_temp.uid(200))
  and (select count(*)=1 from public.tenant_audit_log
    where actor_id=pg_temp.uid(1) and details->>'op'='set_expiry'),
  'EXPIRY_STALE_STATE_NO_FRAGMENTS'
);

set local role service_role;
do $$ begin
  begin
    perform public.set_pro_document_expiry(
      pg_temp.uid(100),pg_temp.uid(1),pg_temp.uid(101),pg_temp.uid(201),pg_temp.uid(301),
      null,'2027-08-13');
    raise exception using errcode='ZT001',message='UNEXPECTED_EXTERNAL_EXPIRY';
  exception when sqlstate 'MD409' then
    if sqlerrm <> 'expiry_externally_managed' then raise; end if;
  when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(
  (select expires_on is null from public.documents where id=pg_temp.uid(201))
  and not exists(select 1 from public.tenant_audit_log
    where details->>'document_id'=pg_temp.uid(201)::text and details->>'op'='set_expiry'),
  'EXTERNAL_EXPIRY_REJECTED'
);

set local role service_role;
do $$ begin
  begin
    update public.document_versions set review_note='Forbidden' where id=pg_temp.uid(302);
    raise exception using errcode='ZT001',message='UNEXPECTED_DIRECT_VERSION_MUTATION';
  exception when insufficient_privilege then null; when sqlstate 'ZT001' then raise; end;
end; $$;
reset role;
select pg_temp.check(
  (select review_note is null from public.document_versions where id=pg_temp.uid(302)),
  'DIRECT_VERSION_MUTATION_DENIED'
);

select 'DOCUMENT_REVIEW_EXPIRY_ASSERTIONS_'||count(*)||'_FAILURES_0' from pg_temp.assertions;
select 'DOCUMENT_REVIEW_EXPIRY_ROLLBACK_PASS';
rollback;
