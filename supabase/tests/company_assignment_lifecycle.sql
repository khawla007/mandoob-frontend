\set ON_ERROR_STOP on
set statement_timeout = '20s';
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
  email, '', pg_catalog.now(), '{}'::jsonb, '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
from (values
  ('94000000-0000-4000-8000-000000000001'::uuid, 'assignment-operator@example.test'),
  ('94000000-0000-4000-8000-000000000011'::uuid, 'assignment-pro1@example.test'),
  ('94000000-0000-4000-8000-000000000012'::uuid, 'assignment-pro2@example.test'),
  ('94000000-0000-4000-8000-000000000013'::uuid, 'assignment-pro3@example.test'),
  ('94000000-0000-4000-8000-000000000014'::uuid, 'assignment-pro4@example.test')
) users(id, email);

insert into public.profiles (id, role, status, full_name) values
  ('94000000-0000-4000-8000-000000000001', 'super_admin', 'active', 'Assignment Operator'),
  ('94000000-0000-4000-8000-000000000011', 'pro', 'active', 'Assignment PRO 1'),
  ('94000000-0000-4000-8000-000000000012', 'pro', 'active', 'Assignment PRO 2'),
  ('94000000-0000-4000-8000-000000000013', 'pro', 'active', 'Assignment PRO 3'),
  ('94000000-0000-4000-8000-000000000014', 'pro', 'active', 'Assignment PRO 4');
insert into public.pro_profiles (profile_id) values
  ('94000000-0000-4000-8000-000000000011'),
  ('94000000-0000-4000-8000-000000000012'),
  ('94000000-0000-4000-8000-000000000013'),
  ('94000000-0000-4000-8000-000000000014');

insert into public.pro_credentials (
  id, pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, submitted_at, created_by
)
select credential_id, pro_id, 'synthetic', pg_catalog.repeat(hash_character, 64), last_four,
  'Synthetic Authority', current_date - 30, current_date + 365,
  'verified', 1, pg_catalog.now(), '94000000-0000-4000-8000-000000000001'
from (values
  ('94000000-0000-4000-8000-000000000021'::uuid, '94000000-0000-4000-8000-000000000011'::uuid, 'a', 'AA11'),
  ('94000000-0000-4000-8000-000000000022'::uuid, '94000000-0000-4000-8000-000000000012'::uuid, 'b', 'BB22'),
  ('94000000-0000-4000-8000-000000000023'::uuid, '94000000-0000-4000-8000-000000000013'::uuid, 'c', 'CC33'),
  ('94000000-0000-4000-8000-000000000024'::uuid, '94000000-0000-4000-8000-000000000014'::uuid, 'd', 'DD44')
) credentials(credential_id, pro_id, hash_character, last_four);

insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from,
  status, version, created_by
)
select term_id, pro_id, term_kind::public.pro_term_kind, 'per_registration', 10000,
  current_date - 1, 'active', 1, '94000000-0000-4000-8000-000000000001'
from (values
  ('94000000-0000-4000-8000-000000000031'::uuid, '94000000-0000-4000-8000-000000000011'::uuid, 'pricing'),
  ('94000000-0000-4000-8000-000000000032'::uuid, '94000000-0000-4000-8000-000000000011'::uuid, 'compensation'),
  ('94000000-0000-4000-8000-000000000033'::uuid, '94000000-0000-4000-8000-000000000012'::uuid, 'pricing'),
  ('94000000-0000-4000-8000-000000000034'::uuid, '94000000-0000-4000-8000-000000000012'::uuid, 'compensation'),
  ('94000000-0000-4000-8000-000000000035'::uuid, '94000000-0000-4000-8000-000000000013'::uuid, 'pricing'),
  ('94000000-0000-4000-8000-000000000036'::uuid, '94000000-0000-4000-8000-000000000013'::uuid, 'compensation'),
  ('94000000-0000-4000-8000-000000000037'::uuid, '94000000-0000-4000-8000-000000000014'::uuid, 'pricing'),
  ('94000000-0000-4000-8000-000000000038'::uuid, '94000000-0000-4000-8000-000000000014'::uuid, 'compensation')
) terms(term_id, pro_id, term_kind);

insert into public.tenants (id, name, slug, plan, status) values
  ('94000000-0000-4000-8000-000000000041', 'Assignment Onboarding', 'assignment-onboarding', 'starter', 'pending'),
  ('94000000-0000-4000-8000-000000000042', 'Assignment Active', 'assignment-active', 'starter', 'active'),
  ('94000000-0000-4000-8000-000000000043', 'Term Rollback', 'term-rollback', 'starter', 'pending'),
  ('94000000-0000-4000-8000-000000000044', 'Audit Rollback', 'audit-rollback', 'starter', 'active');
insert into public.company_profiles (id, tenant_id, company_name, status) values
  ('94000000-0000-4000-8000-000000000051', '94000000-0000-4000-8000-000000000041', 'Assignment Onboarding LLC', 'onboarding'),
  ('94000000-0000-4000-8000-000000000052', '94000000-0000-4000-8000-000000000042', 'Assignment Active LLC', 'active'),
  ('94000000-0000-4000-8000-000000000053', '94000000-0000-4000-8000-000000000043', 'Term Rollback LLC', 'onboarding'),
  ('94000000-0000-4000-8000-000000000054', '94000000-0000-4000-8000-000000000044', 'Audit Rollback LLC', 'active');

create function pg_temp.assert_eligibility_code(p_pro_id uuid, p_company_id uuid, p_code text)
returns void language plpgsql as $$
declare v_result jsonb;
begin
  v_result := public.evaluate_pro_assignment_eligibility(p_pro_id, p_company_id);
  if not (v_result -> 'codes' ? p_code) then
    raise exception 'missing expected eligibility code %', p_code;
  end if;
end;
$$;

-- Exhaustive evaluator states: each mutation is rolled back automatically with the fixture.
update public.profiles set status = 'disabled' where id = '94000000-0000-4000-8000-000000000013';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_ACCOUNT_INACTIVE');
update public.profiles set status = 'active' where id = '94000000-0000-4000-8000-000000000013';
delete from public.pro_credentials where pro_profile_id = '94000000-0000-4000-8000-000000000013';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_MISSING');
insert into public.pro_credentials (
  id, pro_profile_id, identifier_ciphertext, identifier_hash, identifier_last4,
  issuing_authority, issue_date, expiry_date, state, version, created_by
) values (
  '94000000-0000-4000-8000-000000000023', '94000000-0000-4000-8000-000000000013',
  'synthetic', pg_catalog.repeat('c', 64), 'CC33', 'Synthetic Authority',
  current_date - 30, current_date + 365, 'draft', 1,
  '94000000-0000-4000-8000-000000000001'
);
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_DRAFT');
update public.pro_credentials set state = 'submitted', submitted_at = pg_catalog.now()
where id = '94000000-0000-4000-8000-000000000023';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_SUBMITTED');
update public.pro_credentials set state = 'under_review' where id = '94000000-0000-4000-8000-000000000023';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_UNDER_REVIEW');
update public.pro_credentials set state = 'rejected' where id = '94000000-0000-4000-8000-000000000023';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_REJECTED');
update public.pro_credentials set state = 'verified', expiry_date = current_date - 1
where id = '94000000-0000-4000-8000-000000000023';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_EXPIRED');
update public.pro_credentials set state = 'revoked', expiry_date = current_date + 365
where id = '94000000-0000-4000-8000-000000000023';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRO_CREDENTIAL_REVOKED');
update public.pro_credentials set state = 'verified' where id = '94000000-0000-4000-8000-000000000023';

delete from public.pro_commercial_terms
where pro_profile_id = '94000000-0000-4000-8000-000000000013' and term_kind = 'pricing';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'PRICING_TERMS_MISSING'); -- verified_unexpired_missing_terms
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from, status, version, created_by
) values (
  '94000000-0000-4000-8000-000000000035', '94000000-0000-4000-8000-000000000013',
  'pricing', 'per_registration', 10000, current_date - 1, 'active', 1,
  '94000000-0000-4000-8000-000000000001'
);
delete from public.pro_commercial_terms
where pro_profile_id = '94000000-0000-4000-8000-000000000013' and term_kind = 'compensation';
select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000013', null, 'COMPENSATION_TERMS_MISSING');
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, amount_minor, effective_from, status, version, created_by
) values (
  '94000000-0000-4000-8000-000000000036', '94000000-0000-4000-8000-000000000013',
  'compensation', 'per_registration', 10000, current_date - 1, 'active', 1,
  '94000000-0000-4000-8000-000000000001'
);

update public.company_profiles set status = 'suspended' where id = '94000000-0000-4000-8000-000000000053';
select pg_temp.assert_eligibility_code(
  '94000000-0000-4000-8000-000000000013',
  '94000000-0000-4000-8000-000000000053',
  'COMPANY_INACTIVE'
);
update public.company_profiles set status = 'onboarding' where id = '94000000-0000-4000-8000-000000000053';

select (public.assign_pro_to_company(
  '94000000-0000-4000-8000-000000000051',
  '94000000-0000-4000-8000-000000000011',
  '94000000-0000-4000-8000-000000000001'
) ->> 'assignmentId')::uuid as onboarding_assignment_id \gset

select pg_temp.assert_eligibility_code('94000000-0000-4000-8000-000000000011', null, 'PRO_ALREADY_ASSIGNED');
select pg_temp.assert_eligibility_code(
  '94000000-0000-4000-8000-000000000011',
  '94000000-0000-4000-8000-000000000051',
  'COMPANY_ALREADY_ASSIGNED'
);

do $$
declare v_detail jsonb; v_selector jsonb;
begin
  v_detail := public.evaluate_pro_assignment_eligibility(
    '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000051'
  );
  v_selector := public.list_eligible_pros_for_company(
    '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000051',
    'Assignment PRO 1', 10
  );
  if v_selector -> 0 -> 'eligibility' <> v_detail then
    raise exception 'selector_detail_parity';
  end if;
  if (select status from public.tenants where id = '94000000-0000-4000-8000-000000000041') <> 'pending' then
    raise exception 'onboarding_company_remains_pending';
  end if;
end;
$$;

update public.pro_credentials set state = 'revoked'
where id = '94000000-0000-4000-8000-000000000021';
do $$
declare v_summary jsonb;
begin
  v_summary := public.read_current_company_assignment_summary(
    '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000051'
  );
  if v_summary ->> 'operationalAccess' <> 'blocked'
     or not (v_summary -> 'operationalAccessCodes' ? 'PRO_CREDENTIAL_REVOKED') then
    raise exception 'revoked_current_assignment_blocked';
  end if;
end;
$$;
update public.pro_credentials set state = 'verified', expiry_date = current_date - 1
where id = '94000000-0000-4000-8000-000000000021';
do $$
declare v_summary jsonb;
begin
  v_summary := public.read_current_company_assignment_summary(
    '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000051'
  );
  if not (v_summary -> 'operationalAccessCodes' ? 'PRO_CREDENTIAL_EXPIRED') then
    raise exception 'expired_current_assignment_blocked';
  end if;
end;
$$;
update public.pro_credentials set expiry_date = current_date + 365
where id = '94000000-0000-4000-8000-000000000021';

select public.release_company_pro(
  '94000000-0000-4000-8000-000000000051', :'onboarding_assignment_id',
  'Lifecycle fixture release', '94000000-0000-4000-8000-000000000001'
);
do $$
declare v_released_assignment_id uuid;
begin
  select id into v_released_assignment_id
  from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000051'
    and status = 'released'
  order by assigned_at desc, id desc
  limit 1;
  perform public.release_company_pro(
    '94000000-0000-4000-8000-000000000051', v_released_assignment_id,
    'Lifecycle fixture replay', '94000000-0000-4000-8000-000000000001'
  );
  raise exception 'release_replay unexpectedly succeeded';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'STALE_ASSIGNMENT' then raise; end if;
end;
$$;

select (public.assign_pro_to_company(
  '94000000-0000-4000-8000-000000000052',
  '94000000-0000-4000-8000-000000000011',
  '94000000-0000-4000-8000-000000000001'
) ->> 'assignmentId')::uuid as active_assignment_id \gset
do $$
begin
  if (select status from public.tenants where id = '94000000-0000-4000-8000-000000000042') <> 'active' then
    raise exception 'active_company_remains_active';
  end if;
  if not exists (
    select 1 from public.pro_company_assignments
    where company_id = '94000000-0000-4000-8000-000000000052'
      and pro_profile_id = '94000000-0000-4000-8000-000000000011'
      and status = 'active'
  ) then raise exception 'released_pro_later_assignment'; end if;
end;
$$;

select (public.reassign_company_pro(
  '94000000-0000-4000-8000-000000000052', :'active_assignment_id',
  '94000000-0000-4000-8000-000000000012', 'Lifecycle fixture reassignment',
  '94000000-0000-4000-8000-000000000001'
) ->> 'assignmentId')::uuid as replacement_assignment_id \gset
do $$
declare v_old_assignment_id uuid;
begin
  select id into v_old_assignment_id
  from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052'
    and pro_profile_id = '94000000-0000-4000-8000-000000000011'
    and status = 'released'
  order by assigned_at desc, id desc
  limit 1;
  perform public.reassign_company_pro(
    '94000000-0000-4000-8000-000000000052', v_old_assignment_id,
    '94000000-0000-4000-8000-000000000011', 'Lifecycle replay',
    '94000000-0000-4000-8000-000000000001'
  );
  raise exception 'reassign_replay unexpectedly succeeded';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'STALE_ASSIGNMENT' then raise; end if;
end;
$$;
do $$
begin
  perform public.release_company_pro(
    '94000000-0000-4000-8000-000000000052',
    '94000000-0000-4000-8000-000000000099', 'Stale fixture',
    '94000000-0000-4000-8000-000000000001'
  );
  raise exception 'stale_expected_assignment unexpectedly succeeded';
exception when sqlstate 'P0001' then
  if sqlerrm <> 'STALE_ASSIGNMENT' then raise; end if;
end;
$$;

do $$
declare
  v_assignment_id uuid;
  v_current_detail jsonb;
  v_current_selector jsonb;
  v_replacement_detail jsonb;
  v_replacement_selector jsonb;
begin
  select id into v_assignment_id from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052' and status = 'active';
  v_current_detail := public.evaluate_company_assignment_eligibility(
    '94000000-0000-4000-8000-000000000012',
    '94000000-0000-4000-8000-000000000052', null
  );
  v_current_selector := public.list_eligible_pros_for_company(
    '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000052', 'Assignment PRO 2', 10
  ) -> 0 -> 'eligibility';
  if v_current_detail <> v_current_selector then raise exception 'current_candidate_parity'; end if;
  v_replacement_detail := public.evaluate_company_assignment_eligibility(
    '94000000-0000-4000-8000-000000000013',
    '94000000-0000-4000-8000-000000000052', v_assignment_id
  );
  v_replacement_selector := public.list_eligible_pros_for_company(
    '94000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000052', 'Assignment PRO 3', 10
  ) -> 0 -> 'eligibility';
  if v_replacement_detail <> v_replacement_selector then
    raise exception 'replacement_candidate_parity';
  end if;
end;
$$;

create function pg_temp.fail_reassign_term_link() returns trigger language plpgsql as $$
begin raise exception 'reassign_term_link_rollback'; end;
$$;
create trigger assignment_fixture_fail_reassign_term_link
before insert on public.pro_assignment_term_links
for each row execute function pg_temp.fail_reassign_term_link();
do $$
declare v_assignment_id uuid; v_history_count bigint; v_link_id uuid;
begin
  select id into v_assignment_id from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052' and status = 'active';
  select count(*) into v_history_count from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052';
  select assignment_id into v_link_id from public.pro_assignment_term_links
  where assignment_id = v_assignment_id;
  begin
    perform public.reassign_company_pro(
      '94000000-0000-4000-8000-000000000052', v_assignment_id,
      '94000000-0000-4000-8000-000000000013', 'Rollback term link',
      '94000000-0000-4000-8000-000000000001'
    );
    raise exception 'reassign_term_link_rollback unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'reassign_term_link_rollback' then raise; end if;
  end;
  if not exists (select 1 from public.pro_company_assignments where id = v_assignment_id
      and status = 'active' and pro_profile_id = '94000000-0000-4000-8000-000000000012')
     or (select count(*) from public.pro_company_assignments
         where company_id = '94000000-0000-4000-8000-000000000052') <> v_history_count
     or not exists (select 1 from public.pro_assignment_term_links where assignment_id = v_link_id)
  then raise exception 'reassign_term_link_rollback state changed'; end if;
end;
$$;
drop trigger assignment_fixture_fail_reassign_term_link on public.pro_assignment_term_links;

create function pg_temp.fail_reassign_audit() returns trigger language plpgsql as $$
begin
  if new.action in ('company_pro_released', 'company_pro_assigned') then
    raise exception 'reassign_audit_rollback';
  end if;
  return new;
end;
$$;
create trigger assignment_fixture_fail_reassign_audit
before insert on public.tenant_audit_log
for each row execute function pg_temp.fail_reassign_audit();
do $$
declare v_assignment_id uuid; v_history_count bigint; v_link_id uuid;
begin
  select id into v_assignment_id from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052' and status = 'active';
  select count(*) into v_history_count from public.pro_company_assignments
  where company_id = '94000000-0000-4000-8000-000000000052';
  select assignment_id into v_link_id from public.pro_assignment_term_links
  where assignment_id = v_assignment_id;
  begin
    perform public.reassign_company_pro(
      '94000000-0000-4000-8000-000000000052', v_assignment_id,
      '94000000-0000-4000-8000-000000000014', 'Rollback audit',
      '94000000-0000-4000-8000-000000000001'
    );
    raise exception 'reassign_audit_rollback unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'reassign_audit_rollback' then raise; end if;
  end;
  if not exists (select 1 from public.pro_company_assignments where id = v_assignment_id
      and status = 'active' and pro_profile_id = '94000000-0000-4000-8000-000000000012')
     or (select count(*) from public.pro_company_assignments
         where company_id = '94000000-0000-4000-8000-000000000052') <> v_history_count
     or not exists (select 1 from public.pro_assignment_term_links where assignment_id = v_link_id)
  then raise exception 'reassign_audit_rollback state changed'; end if;
end;
$$;
drop trigger assignment_fixture_fail_reassign_audit on public.tenant_audit_log;

create function pg_temp.fail_term_link() returns trigger language plpgsql as $$
begin raise exception 'term_link_rollback'; end;
$$;
create trigger assignment_fixture_fail_term_link
before insert on public.pro_assignment_term_links
for each row execute function pg_temp.fail_term_link();
do $$
begin
  perform public.assign_pro_to_company(
    '94000000-0000-4000-8000-000000000053',
    '94000000-0000-4000-8000-000000000013',
    '94000000-0000-4000-8000-000000000001'
  );
  raise exception 'term_link_rollback unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'term_link_rollback' then raise; end if;
end;
$$;
drop trigger assignment_fixture_fail_term_link on public.pro_assignment_term_links;
do $$
begin
  if exists (
    select 1 from public.pro_company_assignments
    where company_id = '94000000-0000-4000-8000-000000000053'
  ) then raise exception 'term_link_rollback left assignment'; end if;
end;
$$;

create function pg_temp.fail_assignment_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'company_pro_assigned' then raise exception 'audit_rollback'; end if;
  return new;
end;
$$;
create trigger assignment_fixture_fail_audit
before insert on public.tenant_audit_log
for each row execute function pg_temp.fail_assignment_audit();
do $$
begin
  perform public.assign_pro_to_company(
    '94000000-0000-4000-8000-000000000054',
    '94000000-0000-4000-8000-000000000014',
    '94000000-0000-4000-8000-000000000001'
  );
  raise exception 'audit_rollback unexpectedly succeeded';
exception when others then
  if sqlerrm <> 'audit_rollback' then raise; end if;
end;
$$;
drop trigger assignment_fixture_fail_audit on public.tenant_audit_log;
do $$
begin
  if exists (
    select 1 from public.pro_company_assignments
    where company_id = '94000000-0000-4000-8000-000000000054'
  ) or exists (
    select 1 from public.pro_assignment_term_links link
    join public.pro_company_assignments assignment on assignment.id = link.assignment_id
    where assignment.company_id = '94000000-0000-4000-8000-000000000054'
  ) then raise exception 'audit_rollback left transactional state'; end if;
end;
$$;

-- Both one-to-one races, release/assign race, and swap/reassign race run in the
-- paired bounded session fixtures asserted by company-assignment-lifecycle-migration.test.ts.
rollback;
