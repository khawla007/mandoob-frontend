\set ON_ERROR_STOP on
\if :{?red_bypass}
    \set red_bypass :red_bypass
\elif true
    \set red_bypass false
\endif
\if :{?wallclock_regression}
    \set wallclock_regression :wallclock_regression
\elif true
    \set wallclock_regression false
\endif
set statement_timeout = '20s';
begin;

-- Metadata simulation only, never proof of provider URLs or physical bytes.
\if :red_bypass
\else
    \set ON_ERROR_STOP on
do $$
begin
    if to_regclass('public.document_access_audit') is null
        or to_regprocedure('public.resolve_document_access(uuid,uuid,uuid,uuid,uuid,integer)') is null then
        raise exception 'DOCUMENT_ACCESS_AUDIT_BOUNDARY_MISSING';
    end if;
end;
$$;
\endif

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
    select ('99030701-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create temp table assertions (label text primary key);
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
    if ok is distinct from true then raise exception '%', label; end if;
    insert into pg_temp.assertions values (label);
end;
$$;
grant all on pg_temp.assertions to authenticated;

insert into public.tenants(id, slug, name) values
    (pg_temp.uid(100), 'doc-access-one', 'Synthetic One'),
    (pg_temp.uid(200), 'doc-access-two', 'Synthetic Two'),
    (pg_temp.uid(300), 'doc-access-three', 'Synthetic Three');
insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select pg_temp.uid(n), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'doc-access-' || n || '@example.invalid',
    '', now(), '{}', '{}', now(), now() from generate_series(1, 9) n;
insert into public.profiles(id, tenant_id, role, status) values
    (pg_temp.uid(1), null, 'super_admin', 'active'),
    (pg_temp.uid(2), null, 'admin', 'active'),
    (pg_temp.uid(3), null, 'pro', 'active'),
    (pg_temp.uid(4), pg_temp.uid(100), 'customer', 'active'),
    (pg_temp.uid(5), pg_temp.uid(100), 'employee', 'active'),
    (pg_temp.uid(6), pg_temp.uid(200), 'customer', 'active'),
    (pg_temp.uid(7), pg_temp.uid(100), 'customer', 'disabled'),
    (pg_temp.uid(8), null, 'admin', 'active'),
    (pg_temp.uid(9), pg_temp.uid(100), 'customer', 'active');
update public.profiles set mfa_enrolled_at=now() where id in (pg_temp.uid(1),pg_temp.uid(2),pg_temp.uid(3),pg_temp.uid(8));
insert into public.company_profiles(id, tenant_id, company_name) values
    (pg_temp.uid(101), pg_temp.uid(100), 'Synthetic Linked'),
    (pg_temp.uid(102), pg_temp.uid(300), 'Synthetic Unlinked'),
    (pg_temp.uid(201), pg_temp.uid(200), 'Synthetic Foreign');
insert into public.customer_profiles(profile_id, linked_company_id) values
    (pg_temp.uid(4), pg_temp.uid(101)), (pg_temp.uid(6), pg_temp.uid(201)),
    (pg_temp.uid(7), pg_temp.uid(101)), (pg_temp.uid(9), null);
insert into public.employees(id, tenant_id, company_id, profile_id, name) values
    (pg_temp.uid(110), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(5), 'Synthetic Self'),
    (pg_temp.uid(111), pg_temp.uid(100), pg_temp.uid(101), null, 'Synthetic Other'),
    (pg_temp.uid(112), pg_temp.uid(300), pg_temp.uid(102), null, 'Synthetic Unlinked');
insert into public.pro_profiles(profile_id) values (pg_temp.uid(3));
insert into public.pro_credentials(id, pro_profile_id, identifier_ciphertext,
    identifier_hash, identifier_last4, issuing_authority, issue_date, expiry_date,
    state, version, submitted_at, created_by)
values (pg_temp.uid(30), pg_temp.uid(3), 'synthetic', repeat('d',64), 'DD33',
    'Synthetic Authority', current_date - 30, current_date + 365, 'verified', 1, now(), pg_temp.uid(1));
insert into public.pro_company_assignments(id, tenant_id, company_id, pro_profile_id, assigned_by)
values (pg_temp.uid(31), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(3), pg_temp.uid(1));
insert into public.document_requests(id, tenant_id, company_id, employee_id, doc_type, label) values
    (pg_temp.uid(120), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(110), 'passport', 'Synthetic Self'),
    (pg_temp.uid(121), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(111), 'passport', 'Synthetic Other'),
    (pg_temp.uid(122), pg_temp.uid(300), pg_temp.uid(102), null, 'other', 'Synthetic Unlinked');
insert into public.documents(id, tenant_id, company_id, request_id, employee_id, doc_type) values
    (pg_temp.uid(130), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(120), pg_temp.uid(110), 'passport'),
    (pg_temp.uid(131), pg_temp.uid(100), pg_temp.uid(101), pg_temp.uid(121), pg_temp.uid(111), 'passport'),
    (pg_temp.uid(132), pg_temp.uid(300), pg_temp.uid(102), pg_temp.uid(122), null, 'other');

set local role authenticated;
do $$ begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.uid(9),
        'app_metadata',jsonb_build_object('role','customer','tenant_id',pg_temp.uid(100)))::text, true);
end; $$;
select pg_temp.check((select count(*)=0 from public.documents where id=pg_temp.uid(130)), 'SAME_TENANT_UNLINKED_CUSTOMER_READ_DENIED');
select pg_temp.check(not has_table_privilege('authenticated','public.documents','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'AUTHENTICATED_DIRECT_MUTATION_DENIED');
reset role;
\if :red_bypass
rollback;
\else
    \set ON_ERROR_STOP on
create function pg_temp.publish(actor integer, op integer, doc integer, req integer,
    emp integer, company integer default 101) returns uuid language plpgsql as $$
declare receipt jsonb; operation public.document_upload_operations; head uuid; tenant uuid; resource_type text;
begin
    select current_version_id,doc_type into head,resource_type from public.documents where id=pg_temp.uid(doc);
    select tenant_id into strict tenant from public.company_profiles where id=pg_temp.uid(company);
    receipt := public.prepare_document_upload(pg_temp.uid(actor),tenant,
        pg_temp.uid(company),pg_temp.uid(op),pg_temp.uid(req),pg_temp.uid(doc),
        pg_temp.uid(emp),resource_type,
        null,head,repeat('a',64),'application/pdf',8,'pdf','synthetic.pdf');
    select * into strict operation from public.document_upload_operations where operation_id=pg_temp.uid(op);
    insert into storage.objects(bucket_id,name,metadata) values ('tenant-documents',operation.storage_path,
        jsonb_build_object('size',8,'mimetype','application/pdf'));
    perform public.finalize_document_upload(pg_temp.uid(actor),tenant,
        pg_temp.uid(company),pg_temp.uid(op),'clean','clamav',clock_timestamp(),
        operation.storage_path,'application/pdf',8,repeat('a',64));
    return (receipt->>'versionId')::uuid;
end;
$$;
create temp table versions (kind text primary key, id uuid);
insert into pg_temp.versions values
    ('self',pg_temp.publish(4,1000,130,120,110)),
    ('other',pg_temp.publish(4,1010,131,121,111)),
    ('unlinked',pg_temp.publish(1,1020,132,122,null,102));
-- A second immutable version proves history access does not need current-head equality.
insert into public.documents(id,tenant_id,company_id,doc_type)
values (pg_temp.uid(134),pg_temp.uid(100),pg_temp.uid(101),'other');
insert into pg_temp.versions values ('history',pg_temp.publish(4,1030,134,null,null));
insert into pg_temp.versions values ('latest',pg_temp.publish(4,1031,134,null,null));
insert into public.documents(id,tenant_id,company_id,doc_type)
values (pg_temp.uid(133),pg_temp.uid(100),pg_temp.uid(101),'other');
insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by)
values (pg_temp.uid(140),pg_temp.uid(133),pg_temp.uid(100),'legacy/general-synthetic.pdf','application/pdf',8,repeat('b',64),pg_temp.uid(4));

create function pg_temp.resolve_document_fixture(actor integer, doc integer, version uuid, company integer default 101,
    tenant integer default 100, seconds integer default 120) returns jsonb language sql as $$
    select public.resolve_document_access(pg_temp.uid(actor),pg_temp.uid(tenant),pg_temp.uid(company),
        pg_temp.uid(doc),version,seconds);
$$;
create function pg_temp.allowed(actor integer, doc integer, kind text, label text) returns void language plpgsql as $$
declare verdict jsonb;
begin
    verdict := pg_temp.resolve_document_fixture(actor,doc,(select id from pg_temp.versions where versions.kind=allowed.kind));
    perform pg_temp.check(verdict->>'status'='allowed',label);
end;
$$;
create function pg_temp.denied(actor integer, doc integer, version uuid, label text,
    company integer default 101, tenant integer default 100, seconds integer default 120)
returns void language plpgsql as $$
declare before_count bigint; before_ids uuid[]; new_audit public.document_access_audit; verdict jsonb;
begin
    select count(*),coalesce(array_agg(id),array[]::uuid[]) into before_count,before_ids
        from public.document_access_audit where event='access_denied';
    verdict := pg_temp.resolve_document_fixture(actor,doc,version,company,tenant,seconds);
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),label || '_SANITIZED');
    perform pg_temp.check((select count(*)=before_count+1 from public.document_access_audit
        where event='access_denied'),label || '_PERSISTED_AUDIT');
    select * into strict new_audit from public.document_access_audit
        where event='access_denied' and not (id=any(before_ids));
    if label='UNKNOWN_ACTOR' then
        perform pg_temp.check(new_audit.actor_id is null and new_audit.tenant_id is null
            and new_audit.company_id is null and new_audit.request_id is null and new_audit.document_id is null
            and new_audit.version_id is null and new_audit.operation_id is null and new_audit.sha256 is null,
            'UNKNOWN_ACTOR_EXACT_CALL_NULL_IDENTITIES');
    elsif label='UNKNOWN_RESOURCE' then
        perform pg_temp.check(new_audit.actor_id=pg_temp.uid(actor) and new_audit.tenant_id is null
            and new_audit.company_id is null and new_audit.request_id is null and new_audit.document_id is null
            and new_audit.version_id is null and new_audit.operation_id is null and new_audit.sha256 is null,
            'UNKNOWN_RESOURCE_EXACT_CALL_NULL_IDENTITIES');
    end if;
end;
$$;

do $$
declare table_name text; role_name text; signature text; actor integer; s uuid;
begin
    foreach table_name in array array['document_requests','documents','document_versions'] loop
        foreach role_name in array array['anon','authenticated','service_role'] loop
            perform pg_temp.check(not has_table_privilege(role_name,'public.'||table_name,
                'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),table_name||'_'||role_name||'_WRITE_ACL');
            perform pg_temp.check(not exists(select 1 from pg_attribute where attrelid=('public.'||table_name)::regclass
                and attnum>0 and not attisdropped and (has_column_privilege(role_name,attrelid,attname,'INSERT')
                or has_column_privilege(role_name,attrelid,attname,'UPDATE')
                or has_column_privilege(role_name,attrelid,attname,'REFERENCES'))),table_name||'_'||role_name||'_COLUMN_ACL');
        end loop;
        perform pg_temp.check((select count(*)=1 and bool_and(polcmd='r') from pg_policy
            where polrelid=('public.'||table_name)::regclass),table_name||'_CUMULATIVE_SELECT_ONLY_POLICY');
    end loop;
    foreach role_name in array array['anon','authenticated','service_role'] loop
        perform pg_temp.check(not has_table_privilege(role_name,'public.document_access_audit',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'AUDIT_PRIVATE_'||role_name);
    end loop;
    perform pg_temp.check(not exists(select 1 from pg_constraint where conrelid='public.document_access_audit'::regclass
        and contype='f'),'AUDIT_NO_CASCADING_PARENTS');
    perform pg_temp.check(not has_table_privilege('authenticated','public.document_versions','SELECT')
        and not has_column_privilege('authenticated','public.document_versions','storage_path','SELECT')
        and not has_column_privilege('authenticated','public.document_versions','sha256','SELECT')
        and not has_column_privilege('authenticated','public.document_versions','upload_operation_id','SELECT')
        and has_column_privilege('authenticated','public.document_versions','review_status','SELECT'),'VERSION_PRIVATE_SIGNING_COLUMNS_DENIED');
    for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
        where ns.nspname='public' and p.proname in ('resolve_document_access','finalize_document_access_grant') loop
        perform pg_temp.check(has_function_privilege('service_role',signature,'EXECUTE')
            and not has_function_privilege('authenticated',signature,'EXECUTE')
            and not has_function_privilege('anon',signature,'EXECUTE'),'SERVICE_RPC_'||signature);
    end loop;
    for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
        where ns.nspname='public' and p.proname like '\_document\_access\_%' escape '\' loop
        perform pg_temp.check(not has_function_privilege('service_role',signature,'EXECUTE')
            and not has_function_privilege('authenticated',signature,'EXECUTE')
            and not has_function_privilege('anon',signature,'EXECUTE'),'PRIVATE_HELPER_'||signature);
    end loop;
    perform pg_temp.check(not exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
        where ns.nspname='public' and (p.proname like '\_document\_access\_%' escape '\'
        or p.proname in ('resolve_document_access','finalize_document_access_grant','can_read_document_metadata'))
        and (p.proowner<>(select oid from pg_roles where rolname='postgres')
        or not p.prosecdef or p.proconfig is distinct from array['search_path=""'])),'ACCESS_OWNER_DEFINER_EMPTY_PATH');
    for actor in 1..5 loop
        perform pg_temp.allowed(actor,130,'self','ROLE_'||actor||'_CLEAN_PENDING_ALLOWED');
    end loop;
    s := (select id from pg_temp.versions where kind='self');
    perform pg_temp.denied(6,130,s,'FOREIGN_TENANT');
    perform pg_temp.denied(7,130,s,'INACTIVE_ACTOR');
    perform pg_temp.denied(9,130,s,'SAME_TENANT_UNLINKED_CUSTOMER');
    perform pg_temp.allowed(8,130,'self','VALID_EXTRA_PLATFORM_ADMIN_ALLOWED');
    perform pg_temp.denied(999,130,s,'UNKNOWN_ACTOR');
    perform pg_temp.denied(4,999,pg_temp.uid(999),'UNKNOWN_RESOURCE');
    perform pg_temp.denied(4,132,(select id from pg_temp.versions where kind='unlinked'),'CROSS_LINKED_COMPANY',102,300);
    perform pg_temp.denied(3,132,(select id from pg_temp.versions where kind='unlinked'),'UNASSIGNED_PRO',102,300);
    perform pg_temp.denied(5,131,(select id from pg_temp.versions where kind='other'),'FOREIGN_EMPLOYEE');
    perform pg_temp.denied(5,133,pg_temp.uid(140),'EMPLOYEE_NO_REQUEST');
    perform pg_temp.denied(4,133,pg_temp.uid(140),'LEGACY_NOT_SCANNED');
    perform pg_temp.denied(4,130,(select id from pg_temp.versions where kind='other'),'MISMATCH_VERSION_CHAIN');
    perform pg_temp.denied(4,130,s,'ZERO_SIGNING_LIFETIME',101,100,0);
    perform pg_temp.denied(4,130,s,'EXCESS_SIGNING_LIFETIME',101,100,301);
end;
$$;

grant select on pg_temp.versions to authenticated;
create function pg_temp.metadata(actor integer, doc integer, expected boolean, label text, aal text default 'aal2')
returns void language plpgsql as $$
declare visible boolean;
begin
    perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(actor),'aal',aal,
        'app_metadata',jsonb_build_object('role','super_admin','tenant_id',pg_temp.uid(100)))::text,true);
    execute 'set local role authenticated';
    select exists(select 1 from public.documents where id=pg_temp.uid(doc)) into visible;
    execute 'reset role';
    perform pg_temp.check(visible=expected,label);
end;
$$;
do $$
declare actor integer; s uuid; old_expiry date;
begin
    for actor in 1..5 loop
        perform pg_temp.metadata(actor,130,true,'ROLE_'||actor||'_SELF_METADATA');
    end loop;
    for actor in 1..3 loop
        perform pg_temp.metadata(actor,130,false,'PRIVILEGED_'||actor||'_AAL1_METADATA_DENIED','aal1');
        perform pg_temp.metadata(actor,130,false,'PRIVILEGED_'||actor||'_MISSING_AAL_METADATA_DENIED',null);
        update public.profiles set mfa_enrolled_at=null where id=pg_temp.uid(actor);
        perform pg_temp.metadata(actor,130,false,'PRIVILEGED_'||actor||'_UNENROLLED_METADATA_DENIED');
        update public.profiles set mfa_enrolled_at=now() where id=pg_temp.uid(actor);
    end loop;
    perform pg_temp.metadata(4,130,true,'CUSTOMER_AAL1_ALLOWED','aal1');
    perform pg_temp.metadata(5,130,true,'EMPLOYEE_AAL1_ALLOWED','aal1');
    perform pg_temp.metadata(4,131,true,'CUSTOMER_LINKED_COMPANY_EMPLOYEE_METADATA');
    perform pg_temp.metadata(4,133,true,'LEGACY_CUSTOMER_METADATA_VISIBLE');
    perform pg_temp.metadata(3,133,true,'LEGACY_PRO_METADATA_VISIBLE');
    perform pg_temp.metadata(5,131,false,'EMPLOYEE_OTHER_METADATA_DENIED');
    perform pg_temp.metadata(5,133,false,'EMPLOYEE_COMPANY_METADATA_DENIED');
    perform pg_temp.metadata(4,132,false,'CUSTOMER_UNLINKED_METADATA_DENIED');
    perform pg_temp.metadata(3,132,false,'PRO_UNASSIGNED_METADATA_DENIED');
    perform pg_temp.metadata(6,130,false,'FOREIGN_CUSTOMER_METADATA_DENIED');
    perform pg_temp.metadata(7,130,false,'INACTIVE_METADATA_DENIED');
    perform pg_temp.metadata(9,130,false,'SAME_TENANT_UNLINKED_CUSTOMER_METADATA_DENIED');
    perform pg_temp.metadata(8,130,true,'VALID_EXTRA_PLATFORM_ADMIN_METADATA');
    perform pg_temp.metadata(999,130,false,'UNKNOWN_ACTOR_METADATA_DENIED');
    perform pg_temp.metadata(4,999,false,'UNKNOWN_RESOURCE_METADATA_DENIED');
    perform pg_temp.allowed(4,134,'history','HISTORICAL_VERSION_ALLOWED');
    s := (select id from pg_temp.versions where kind='self');
    update public.profiles set status='disabled' where id=pg_temp.uid(4);
    perform pg_temp.denied(4,130,s,'READER_REVOKED');
    perform pg_temp.metadata(4,130,false,'READER_REVOKED_METADATA');
    perform pg_temp.allowed(1,130,'self','HISTORICAL_UPLOADER_REVOKED_ADMIN_ALLOWED');
    perform pg_temp.allowed(5,130,'self','HISTORICAL_UPLOADER_REVOKED_EMPLOYEE_ALLOWED');
    update public.profiles set status='active' where id=pg_temp.uid(4);
    update public.employees set status='inactive' where id=pg_temp.uid(110);
    perform pg_temp.denied(5,130,s,'INACTIVE_EMPLOYEE');
    perform pg_temp.metadata(5,130,false,'INACTIVE_EMPLOYEE_METADATA');
    update public.employees set status='active' where id=pg_temp.uid(110);
    update public.tenants set status='suspended' where id=pg_temp.uid(100);
    perform pg_temp.denied(4,130,s,'INACTIVE_TENANT');
    perform pg_temp.metadata(4,130,false,'INACTIVE_TENANT_METADATA');
    update public.tenants set status='active' where id=pg_temp.uid(100);
    select expiry_date into old_expiry from public.pro_credentials where id=pg_temp.uid(30);
    update public.pro_credentials set expiry_date=(now() at time zone 'Asia/Dubai')::date-1 where id=pg_temp.uid(30);
    perform pg_temp.denied(3,130,s,'EXPIRED_PRO_LICENSE');
    perform pg_temp.metadata(3,130,false,'EXPIRED_PRO_LICENSE_METADATA');
    update public.pro_credentials set expiry_date=old_expiry where id=pg_temp.uid(30);
    update public.pro_company_assignments set status='released',released_at=now(),released_by=pg_temp.uid(1),
        release_reason='Synthetic revoked' where id=pg_temp.uid(31);
    perform pg_temp.denied(3,130,s,'RELEASED_PRO_ASSIGNMENT');
    perform pg_temp.metadata(3,130,false,'RELEASED_PRO_ASSIGNMENT_METADATA');
    update public.pro_company_assignments set status='active',released_at=null,released_by=null,
        release_reason=null where id=pg_temp.uid(31);
    update public.document_versions set review_status='rejected' where id=s;
    perform pg_temp.denied(4,130,s,'REJECTED_VERSION');
    update public.document_versions set review_status='pending' where id=s;
    update public.documents set expires_on=(now() at time zone 'Asia/Dubai')::date-1 where id=pg_temp.uid(130);
    perform pg_temp.denied(4,130,s,'EXPIRED_DOCUMENT_DUBAI');
    update public.documents set expires_on=(now() at time zone 'Asia/Dubai')::date where id=pg_temp.uid(130);
    perform pg_temp.allowed(4,130,'self','EXPIRY_DUE_TODAY_ALLOWED');
    update public.documents set expires_on=null where id=pg_temp.uid(130);
    update public.document_requests set employee_id=pg_temp.uid(111) where id=pg_temp.uid(120);
    perform pg_temp.denied(5,130,s,'FOREIGN_REQUEST_EMPLOYEE');
    perform pg_temp.metadata(5,130,false,'FOREIGN_REQUEST_METADATA_DENIED');
    update public.document_requests set employee_id=pg_temp.uid(110) where id=pg_temp.uid(120);
    update public.document_requests set status='cancelled' where id=pg_temp.uid(120);
    perform pg_temp.denied(4,130,s,'CANCELLED_REQUEST_RESOURCE');
    update public.document_requests set status='fulfilled' where id=pg_temp.uid(120);
end;
$$;

insert into public.document_requests(id,tenant_id,company_id,employee_id,doc_type,label) values
    (pg_temp.uid(124),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(110),'visa','Synthetic Visa'),
    (pg_temp.uid(125),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(110),'emirates_id','Synthetic EID');
insert into public.documents(id,tenant_id,company_id,employee_id,request_id,doc_type) values
    (pg_temp.uid(135),pg_temp.uid(100),pg_temp.uid(101),null,null,'trade_license'),
    (pg_temp.uid(136),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(110),pg_temp.uid(124),'visa'),
    (pg_temp.uid(137),pg_temp.uid(100),pg_temp.uid(101),pg_temp.uid(110),pg_temp.uid(125),'emirates_id');
insert into pg_temp.versions values
    ('trade_license',pg_temp.publish(4,1040,135,null,null)),
    ('visa',pg_temp.publish(4,1041,136,124,110)),
    ('emirates_id',pg_temp.publish(4,1042,137,125,110));
do $$
declare today date := (clock_timestamp() at time zone 'Asia/Dubai')::date;
begin
    update public.documents set expires_on=today+100 where id in (pg_temp.uid(135),pg_temp.uid(136),pg_temp.uid(137));
    update public.company_profiles set license_expiry=today-1 where id=pg_temp.uid(101);
    update public.employees set visa_expiry=today-1,eid_expiry=today-1 where id=pg_temp.uid(110);
    perform pg_temp.denied(4,135,(select id from pg_temp.versions where kind='trade_license'),'AUTHORITATIVE_COMPANY_LICENSE_EXPIRED');
    perform pg_temp.denied(4,136,(select id from pg_temp.versions where kind='visa'),'AUTHORITATIVE_EMPLOYEE_VISA_EXPIRED');
    perform pg_temp.denied(4,137,(select id from pg_temp.versions where kind='emirates_id'),'AUTHORITATIVE_EMPLOYEE_EID_EXPIRED');
    update public.documents set expires_on=today-100 where id in (pg_temp.uid(135),pg_temp.uid(136),pg_temp.uid(137));
    update public.company_profiles set license_expiry=today where id=pg_temp.uid(101);
    update public.employees set visa_expiry=today,eid_expiry=today where id=pg_temp.uid(110);
    perform pg_temp.allowed(4,135,'trade_license','AUTHORITATIVE_COMPANY_LICENSE_TODAY_ALLOWED');
    perform pg_temp.allowed(5,136,'visa','AUTHORITATIVE_EMPLOYEE_VISA_TODAY_ALLOWED');
    perform pg_temp.allowed(5,137,'emirates_id','AUTHORITATIVE_EMPLOYEE_EID_TODAY_ALLOWED');
    update public.company_profiles set license_expiry=null where id=pg_temp.uid(101);
    update public.employees set visa_expiry=null,eid_expiry=null where id=pg_temp.uid(110);
    perform pg_temp.allowed(4,135,'trade_license','NULL_MANAGED_COMPANY_EXPIRY_NOT_FABRICATED');
    perform pg_temp.allowed(4,136,'visa','NULL_MANAGED_VISA_EXPIRY_NOT_FABRICATED');
    perform pg_temp.allowed(4,137,'emirates_id','NULL_MANAGED_EID_EXPIRY_NOT_FABRICATED');
end;
$$;

create temp table grant_context as
select pg_temp.resolve_document_fixture(4,130,(select id from pg_temp.versions where kind='self')) as context;
create function pg_temp.grant_access(actor integer, context jsonb, expected_sha text default null,
    expires_at timestamptz default null, seconds integer default 120) returns jsonb language sql as $$
    select public.finalize_document_access_grant(pg_temp.uid(actor),pg_temp.uid(100),pg_temp.uid(101),
        (context->>'documentId')::uuid,(context->>'versionId')::uuid,
        (context->>'operationId')::uuid,coalesce(expected_sha,context->>'sha256'),seconds,
        coalesce(expires_at,(context->>'expiresAt')::timestamptz));
$$;
do $$
declare c jsonb; verdict jsonb; before_count bigint; s uuid;
begin
    select context into c from pg_temp.grant_context;
    s := (c->>'versionId')::uuid;
    select count(*) into before_count from public.document_access_audit where event='access_granted';
    perform pg_temp.check(before_count=0,'RESOLUTION_NOT_DOWNLOAD_OR_GRANT_AUDIT');
    verdict := pg_temp.grant_access(4,c,repeat('c',64));
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_EXPECTED_HASH_RECHECK');
    verdict := pg_temp.grant_access(4,c,null,clock_timestamp()-interval '1 second');
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_PROVIDER_EXPIRY_PAST_DENIED');
    verdict := pg_temp.grant_access(4,c,null,clock_timestamp()+interval '301 seconds');
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_PROVIDER_EXPIRY_UNBOUNDED_DENIED');
    verdict := pg_temp.grant_access(4,c,null,null,0);
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_ZERO_LIFETIME_DENIED');
    update public.profiles set status='disabled' where id=pg_temp.uid(4);
    verdict := pg_temp.grant_access(4,c);
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_READER_REVOKED');
    update public.profiles set status='active' where id=pg_temp.uid(4);
    update public.document_versions set review_status='rejected' where id=s;
    verdict := pg_temp.grant_access(4,c);
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_REVIEW_REJECTED');
    update public.document_versions set review_status='pending' where id=s;
    update public.documents set expires_on=(now() at time zone 'Asia/Dubai')::date-1 where id=pg_temp.uid(130);
    verdict := pg_temp.grant_access(4,c);
    perform pg_temp.check(verdict=jsonb_build_object('status','denied'),'FINAL_GRANT_RESOURCE_EXPIRED');
    update public.documents set expires_on=null where id=pg_temp.uid(130);
    perform pg_temp.check((select count(*)=before_count from public.document_access_audit
        where event='access_granted'),'DENIED_SIGNERS_CREATE_NO_GRANT');
    verdict := pg_temp.grant_access(4,c);
    perform pg_temp.check(verdict->>'status'='granted' and verdict->>'auditId' is not null,'FINAL_GRANT_ALLOWED');
    perform pg_temp.check((select count(*)=before_count+1 from public.document_access_audit
        where event='access_granted' and actor_id=pg_temp.uid(4) and tenant_id=pg_temp.uid(100)
        and company_id=pg_temp.uid(101) and document_id=pg_temp.uid(130) and version_id=s
        and sha256=repeat('a',64)),'GRANT_REQUIRED_AUDIT_COMPLETE');
end;
$$;

-- Audit failures must block grants. This fixture-owned trigger is never deployed.
create function pg_temp.fail_access_audit() returns trigger language plpgsql as $$
begin raise exception using errcode='ZX001',message='synthetic_audit_failure'; end;
$$;
create trigger synthetic_access_audit_failure before insert on public.document_access_audit
for each row execute function pg_temp.fail_access_audit();
do $$
declare before_count bigint; blocked boolean := false;
begin
    select count(*) into before_count from public.document_access_audit;
    begin
        perform pg_temp.grant_access(4,(select context from pg_temp.grant_context));
    exception when sqlstate 'ZX001' then blocked := true;
    end;
    perform pg_temp.check(blocked and (select count(*)=before_count from public.document_access_audit),'AUDIT_FAILURE_BLOCKS_SUCCESS_ATOMICALLY');
    blocked := false;
    begin
        perform pg_temp.resolve_document_fixture(4,999,pg_temp.uid(999));
    exception when sqlstate 'ZX001' then blocked := true;
    end;
    perform pg_temp.check(blocked and (select count(*)=before_count from public.document_access_audit),'AUDIT_FAILURE_BLOCKS_DENIAL_VERDICT');
end;
$$;
drop trigger synthetic_access_audit_failure on public.document_access_audit;

insert into storage.objects(bucket_id,name,metadata) values
    ('tenant-documents',pg_temp.uid(100)::text||'/legacy-synthetic.pdf','{"size":8,"mimetype":"application/pdf"}'),
    ('tenant-documents','pro-credentials/'||pg_temp.uid(3)||'/'||pg_temp.uid(30)||'/'||pg_temp.uid(3000),'{"size":8,"mimetype":"application/pdf"}');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(4))::text,true); end; $$;
select pg_temp.check(not exists(select 1 from storage.objects where bucket_id='tenant-documents'
    and name not like 'pro-credentials/%'),'GENERAL_STORAGE_METADATA_LIST_READ_DENIED');
do $$
declare blocked boolean := false;
begin
    perform pg_temp.check(exists(select 1 from public.document_versions where id=pg_temp.uid(140)),
        'LEGACY_VERSION_SAFE_METADATA_VISIBLE');
    begin
        perform storage_path from public.document_versions where id=pg_temp.uid(140);
    exception when insufficient_privilege then blocked := true;
    end;
    perform pg_temp.check(blocked,'DIRECT_PRIVATE_VERSION_PATH_SELECT_DENIED');
    blocked := false;
    begin
        insert into storage.objects(bucket_id,name,metadata) values
            ('tenant-documents',pg_temp.uid(100)::text||'/direct-synthetic.pdf','{"size":8,"mimetype":"application/pdf"}');
    exception when insufficient_privilege then blocked := true;
    end;
    perform pg_temp.check(blocked,'GENERAL_STORAGE_DIRECT_CREATE_DENIED');
end;
$$;
reset role;
select pg_temp.check(exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
    and not polpermissive and polcmd='*' and pg_get_expr(polqual,polrelid) like '%pro-credentials/%'
    and pg_get_expr(polwithcheck,polrelid) like '%pro-credentials/%'),'ACTUAL_CREDENTIAL_PREFIX_EXCEPTION_PRESERVED');
select pg_temp.check(exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass
    and tgname='document_upload_cleanup_storage_write' and tgenabled='O'),'CANONICAL_STORAGE_WRITE_GUARD_RETAINED');
select pg_temp.check((select not public from storage.buckets where id='tenant-documents'),'GENERAL_BUCKET_PRIVATE');
do $$
declare privilege_name text; signature text;
begin
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
        perform pg_temp.check(has_table_privilege('service_role','storage.objects',privilege_name),
            'SERVICE_STORAGE_'||privilege_name||'_PROTOCOL_RETAINED');
    end loop;
    for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
        where ns.nspname='public' and p.proname in ('list_pro_document_center','get_pro_document_version_history') loop
        perform pg_temp.check(has_function_privilege('service_role',signature,'EXECUTE')
            and not has_function_privilege('authenticated',signature,'EXECUTE')
            and not has_function_privilege('anon',signature,'EXECUTE'),'LEGACY_PRIVATE_READ_RPC_'||signature);
    end loop;
end;
$$;

do $$
declare verb text; blocked boolean;
begin
    foreach verb in array array['update public.document_access_audit set occurred_at=now()',
        'delete from public.document_access_audit','truncate public.document_access_audit'] loop
        blocked := false;
        begin execute verb;
        exception when sqlstate 'DU409' then blocked := true;
        end;
        perform pg_temp.check(blocked,'AUDIT_IMMUTABLE_'||split_part(verb,' ',1));
    end loop;
end;
$$;

do $$
declare receipt jsonb; r public.document_upload_operations; blocked boolean := false; before_count bigint;
begin
    receipt := public.prepare_document_upload(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),
        pg_temp.uid(2000),null,null,null,'cv_resume',null,null,repeat('a',64),
        'application/pdf',8,'pdf','synthetic.pdf');
    select * into strict r from public.document_upload_operations where operation_id=pg_temp.uid(2000);
    insert into storage.objects(bucket_id,name,metadata) values ('tenant-documents',r.storage_path,
        jsonb_build_object('size',8,'mimetype','application/pdf'));
    select count(*) into before_count from public.document_access_audit where event='access_denied';
    receipt := public.resolve_document_access(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),
        r.document_id,r.reserved_version_id,120);
    perform pg_temp.check(receipt=jsonb_build_object('status','denied'),'STAGED_UNPUBLISHED_NOT_SIGNABLE');
    perform pg_temp.check((select count(*)=before_count+1 from public.document_access_audit
        where event='access_denied'),'STAGED_UNPUBLISHED_PERSISTED_DENIAL_AUDIT');
    begin
        perform public.finalize_document_upload(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),
            r.operation_id,'quarantined','clamav',clock_timestamp(),r.storage_path,'application/pdf',8,repeat('a',64));
    exception when sqlstate 'DU412' then blocked := true;
    end;
    perform pg_temp.check(blocked,'QUARANTINED_UPLOAD_NOT_PUBLISHED');
    receipt := public.resolve_document_access(pg_temp.uid(4),pg_temp.uid(100),pg_temp.uid(101),
        r.document_id,r.reserved_version_id,120);
    perform pg_temp.check(receipt=jsonb_build_object('status','denied'),'QUARANTINED_VERSION_NOT_SIGNABLE');
end;
$$;
\if :wallclock_regression
-- Narrow owner-only test clock seam, entirely rolled back with this fixture.
-- On old405 this date source is not consulted: both PRO decisions incorrectly
-- allow a licence valid on the transaction's start day but expired on access day.
create or replace function public._document_access_business_date()
returns date language sql volatile security definer set search_path = '' as $$
    select (pg_catalog.now() at time zone 'Asia/Dubai')::date+1;
$$;
alter function public._document_access_business_date() owner to postgres;
revoke all on function public._document_access_business_date() from public, anon, authenticated, service_role;
update public.pro_credentials set expiry_date=(pg_catalog.now() at time zone 'Asia/Dubai')::date
    where id=pg_temp.uid(30);
do $$
declare resolver jsonb; grant_verdict jsonb; customer jsonb; before_ids uuid[]; c jsonb; pro_metadata boolean;
begin
    select coalesce(array_agg(id),array[]::uuid[]) into before_ids from public.document_access_audit;
    select context into c from pg_temp.grant_context;
    resolver := pg_temp.resolve_document_fixture(3,130,(select id from pg_temp.versions where kind='self'));
    grant_verdict := pg_temp.grant_access(3,c);
    customer := pg_temp.resolve_document_fixture(4,130,(select id from pg_temp.versions where kind='self'));
    perform pg_temp.check(customer->>'status'='allowed','MIDNIGHT_CUSTOMER_CONTROL_ALLOWED');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(3),'aal','aal2')::text,true);
    execute 'set local role authenticated';
    select exists(select 1 from public.documents where id=pg_temp.uid(130)) into pro_metadata;
    execute 'reset role';
    if resolver->>'status'='allowed' and grant_verdict->>'status'='granted' and pro_metadata then
        raise exception 'PRO_TRANSACTION_MIDNIGHT_RESOLVER_AND_GRANT_ALLOW_EXPIRED_LICENSE';
    end if;
    perform pg_temp.check(resolver=jsonb_build_object('status','denied'),'MIDNIGHT_PRO_RESOLVER_DENIED');
    perform pg_temp.check(grant_verdict=jsonb_build_object('status','denied'),'MIDNIGHT_PRO_GRANT_DENIED');
    perform pg_temp.check((select count(*)=2 and bool_and(event='access_denied' and classification='authority'
        and actor_id=pg_temp.uid(3) and sha256 is null) from public.document_access_audit
        where not (id=any(before_ids))),'MIDNIGHT_EXACT_TWO_REQUIRED_DENIAL_AUDITS');
    perform pg_temp.check(not exists(select 1 from public.document_access_audit
        where not (id=any(before_ids)) and event='access_granted'),'MIDNIGHT_EXPIRED_PRO_NO_FALSE_GRANT');
    perform pg_temp.check(pro_metadata=false,'MIDNIGHT_PRO_METADATA_DENIED');
    perform pg_temp.metadata(4,130,true,'MIDNIGHT_CUSTOMER_METADATA_CONTROL_ALLOWED','aal1');
end;
$$;
\endif
select set_config('storage.allow_delete_query','true',true);
delete from storage.objects where bucket_id='tenant-documents' and name=(select storage_path
    from public.document_upload_operations where operation_id=pg_temp.uid(1000));
select set_config('storage.allow_delete_query','false',true);
select pg_temp.denied(4,130,(select id from pg_temp.versions where kind='self'),'MISSING_CANONICAL_OBJECT');

select count(*) as document_access_assertions from pg_temp.assertions;
rollback;
\endif
