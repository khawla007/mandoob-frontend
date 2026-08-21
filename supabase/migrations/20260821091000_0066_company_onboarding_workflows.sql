-- Atomic service-role workflows for the normalized company-onboarding record.
begin;

-- Draft bank rows may exist before an identifier is supplied. Completion and
-- activation enforce identifier presence through the section workflow/evaluator.
alter table public.company_bank_details
  drop constraint company_bank_details_identifier_required;

create or replace function public.seed_company_onboarding_sections()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_onboarding_sections (tenant_id, company_id, section_key)
  select new.tenant_id, new.id, section_key
  from pg_catalog.unnest(enum_range(null::public.company_onboarding_section_key)) section_key;
  return new;
end;
$$;

revoke all on function public.seed_company_onboarding_sections()
  from public, anon, authenticated;
create trigger company_profiles_seed_onboarding_sections
  after insert on public.company_profiles
  for each row execute function public.seed_company_onboarding_sections();

create or replace function public.prepare_company_onboarding_operation(
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_expected_onboarding_version bigint,
  p_operation_id uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.company_profiles;
  v_actor public.profiles;
  v_tenant_status text;
  v_operation public.company_onboarding_operations;
begin
  if p_actor_id is null or p_tenant_id is null or p_company_id is null
     or p_operation_id is null or p_expected_onboarding_version is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
  end if;

  perform public.lock_company_assignment_resources(p_company_id, array[p_actor_id]);

  select company.* into v_company
  from public.company_profiles company
  where company.id = p_company_id and company.tenant_id = p_tenant_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_FOUND';
  end if;

  select tenant.status into v_tenant_status
  from public.tenants tenant
  where tenant.id = p_tenant_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'COMPANY_NOT_FOUND';
  end if;

  select profile.* into v_actor
  from public.profiles profile
  where profile.id = p_actor_id and profile.status = 'active'
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_actor.role in ('admin', 'super_admin') and v_actor.tenant_id is null then
    null;
  elsif v_actor.role = 'pro' then
    perform 1
    from public.pro_company_assignments assignment
    join public.pro_profiles pro on pro.profile_id = assignment.pro_profile_id
    where assignment.pro_profile_id = p_actor_id
      and assignment.tenant_id = p_tenant_id
      and assignment.company_id = p_company_id
      and assignment.status = 'active'
      and pro.credentials_verified = true
    for update of assignment, pro;
    if not found then
      raise exception using errcode = 'P0001', message = 'ASSIGNMENT_NOT_FOUND';
    end if;
  else
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if v_tenant_status = 'suspended' or v_company.status in ('suspended', 'churned') then
    raise exception using errcode = 'P0001', message = 'COMPANY_INACTIVE';
  end if;

  select operation.* into v_operation
  from public.company_onboarding_operations operation
  where operation.company_id = p_company_id
    and operation.operation_id = p_operation_id;
  if found then
    if v_operation.payload_hash <> p_payload_hash then
      raise exception using errcode = 'P0001', message = 'OPERATION_REUSED';
    end if;
    return v_operation.result;
  end if;

  if v_company.onboarding_version <> p_expected_onboarding_version then
    raise exception using errcode = 'P0001', message = 'STALE_ONBOARDING_VERSION';
  end if;

  return null;
end;
$$;

revoke all on function public.prepare_company_onboarding_operation(
  uuid, uuid, uuid, bigint, uuid, text
) from public, anon, authenticated;

create or replace function public.record_company_onboarding_operation(
  p_tenant_id uuid,
  p_company_id uuid,
  p_operation_id uuid,
  p_operation_kind text,
  p_payload_hash text,
  p_result jsonb,
  p_committed_version bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.company_onboarding_operations (
    tenant_id, company_id, operation_id, operation_kind, payload_hash, result, committed_version
  ) values (
    p_tenant_id, p_company_id, p_operation_id, p_operation_kind,
    p_payload_hash, p_result, p_committed_version
  );
$$;

revoke all on function public.record_company_onboarding_operation(
  uuid, uuid, uuid, text, text, jsonb, bigint
) from public, anon, authenticated;

create or replace function public.evaluate_company_activation_readiness(p_company_id uuid)
returns table(code text, section text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  with company as (
    select profile.*, tenant.status as tenant_status
    from public.company_profiles profile
    join public.tenants tenant on tenant.id = profile.tenant_id
    where profile.id = p_company_id
  ),
  sections as (
    select section.section_key::text as section_key, section.status::text as status
    from public.company_onboarding_sections section
    where section.company_id = p_company_id
  ),
  shareholder_stats as (
    select count(*) as row_count, coalesce(sum(ownership_percent), 0) as ownership_total
    from public.company_shareholders where company_id = p_company_id
  ),
  activity_stats as (
    select count(*) as row_count, count(*) filter (where is_primary) as primary_count
    from public.company_registered_activities where company_id = p_company_id
  ),
  facts as (
    select company.*,
      office.office_type, office.address_line_1, office.area, office.city, office.emirate,
      office.provider_name, office.lease_reference, office.lease_expiry,
      bank.bank_name, bank.account_holder_name, bank.currency_code,
      bank.iban_encrypted, bank.account_number_encrypted,
      shareholder_stats.row_count as shareholder_count,
      shareholder_stats.ownership_total,
      activity_stats.row_count as activity_count,
      activity_stats.primary_count,
      exists (
        select 1 from public.pro_company_assignments assignment
        join public.profiles profile on profile.id = assignment.pro_profile_id
        join public.pro_profiles pro on pro.profile_id = assignment.pro_profile_id
        where assignment.company_id = p_company_id
          and assignment.status = 'active'
          and profile.status = 'active'
          and pro.credentials_verified = true
      ) as has_verified_assignment,
      (pg_catalog.now() at time zone 'Asia/Dubai')::date as dubai_date
    from company
    cross join shareholder_stats
    cross join activity_stats
    left join public.company_office_details office on office.company_id = company.id
    left join public.company_bank_details bank on bank.company_id = company.id
  ),
  requirements(order_no, code, section, state, unmet) as (
    values
      (1, 'LEGAL_SECTION_INCOMPLETE', 'legal', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'legal'), true)),
      (2, 'LEGAL_NAME_MISSING', 'legal', 'missing',
        coalesce((select company_name is null or pg_catalog.btrim(company_name) = '' from facts), true)),
      (3, 'JURISDICTION_TYPE_MISSING', 'legal', 'missing',
        coalesce((select jurisdiction_type is null from facts), true)),
      (4, 'LICENSING_AUTHORITY_MISSING', 'legal', 'missing',
        coalesce((select licensing_authority is null from facts), true)),
      (5, 'LEGAL_STRUCTURE_MISSING', 'legal', 'missing',
        coalesce((select legal_structure is null from facts), true)),
      (6, 'TRADE_LICENSE_MISSING', 'legal', 'missing',
        coalesce((select trade_license_no is null from facts), true)),
      (7, 'LICENSE_EXPIRY_MISSING', 'legal', 'missing',
        coalesce((select license_expiry is null from facts), true)),
      (8, 'LICENSE_EXPIRED', 'legal', 'expired',
        coalesce((select license_expiry is not null and license_expiry < dubai_date from facts), false)),
      (9, 'SHAREHOLDERS_SECTION_INCOMPLETE', 'shareholders', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'shareholders'), true)),
      (10, 'SHAREHOLDER_MISSING', 'shareholders', 'missing',
        coalesce((select shareholder_count = 0 from facts), true)),
      (11, 'OWNERSHIP_TOTAL_NOT_100', 'shareholders', 'invalid',
        coalesce((select ownership_total <> 100.0000 from facts), true)),
      (12, 'ACTIVITIES_SECTION_INCOMPLETE', 'activities', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'activities'), true)),
      (13, 'ACTIVITY_MISSING', 'activities', 'missing',
        coalesce((select activity_count = 0 from facts), true)),
      (14, 'PRIMARY_ACTIVITY_MISSING', 'activities', 'invalid',
        coalesce((select primary_count <> 1 from facts), true)),
      (15, 'OFFICE_SECTION_INCOMPLETE', 'office', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'office'), true)),
      (16, 'OFFICE_TYPE_MISSING', 'office', 'missing',
        coalesce((select office_type is null from facts), true)),
      (17, 'OFFICE_ADDRESS_MISSING', 'office', 'missing', coalesce((select
        office_type is null or city is null or emirate is null
        or (office_type = 'physical' and (address_line_1 is null or area is null))
        or (office_type = 'flexi_desk' and (provider_name is null or area is null))
        or (office_type = 'virtual' and provider_name is null) from facts), true)),
      (18, 'OFFICE_LEASE_REFERENCE_MISSING', 'office', 'missing', coalesce((select
        office_type in ('physical', 'flexi_desk') and lease_reference is null from facts), false)),
      (19, 'OFFICE_LEASE_EXPIRY_MISSING', 'office', 'missing', coalesce((select
        office_type in ('physical', 'flexi_desk') and lease_expiry is null from facts), false)),
      (20, 'OFFICE_LEASE_EXPIRED', 'office', 'expired', coalesce((select
        lease_expiry is not null and lease_expiry < dubai_date from facts), false)),
      (21, 'ESTABLISHMENT_SECTION_INCOMPLETE', 'establishment', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'establishment'), true)),
      (22, 'ESTABLISHMENT_CARD_MISSING', 'establishment', 'missing', coalesce((select
        establishment_card_no_encrypted is null or establishment_card_no_hash is null
        or establishment_card_no_last4 is null from facts), true)),
      (23, 'ESTABLISHMENT_CARD_EXPIRY_MISSING', 'establishment', 'missing',
        coalesce((select establishment_card_expiry is null from facts), true)),
      (24, 'ESTABLISHMENT_CARD_EXPIRED', 'establishment', 'expired', coalesce((select
        establishment_card_expiry is not null and establishment_card_expiry < dubai_date from facts), false)),
      (25, 'BANK_SECTION_INCOMPLETE', 'bank', 'blocked',
        coalesce((select status <> 'complete' from sections where section_key = 'bank'), true)),
      (26, 'BANK_ACCOUNT_MISSING', 'bank', 'missing', coalesce((select
        bank_name is null or account_holder_name is null or currency_code <> 'AED'
        or (iban_encrypted is null and account_number_encrypted is null) from facts), true)),
      (27, 'ACTIVE_VERIFIED_PRO_ASSIGNMENT_MISSING', 'assignment', 'blocked',
        coalesce((select not has_verified_assignment from facts), true)),
      (28, 'TENANT_NOT_ACTIVATABLE', 'workspace', 'blocked',
        coalesce((select tenant_status not in ('pending', 'unassigned', 'active') from facts), true))
  )
  select requirements.code, requirements.section, requirements.state
  from requirements where requirements.unmet
  order by requirements.order_no;
$$;

revoke all on function public.evaluate_company_activation_readiness(uuid)
  from public, anon, authenticated;
grant execute on function public.evaluate_company_activation_readiness(uuid) to service_role;

create or replace function public.save_company_onboarding_section_internal(
  p_section public.company_onboarding_section_key,
  p_actor_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_expected_onboarding_version bigint,
  p_operation_id uuid,
  p_payload_hash text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_replay jsonb;
  v_result jsonb;
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := array[]::uuid[];
  v_complete boolean := coalesce((p_payload ->> 'complete_section')::boolean, false);
  v_version bigint;
  v_lifecycle public.company_onboarding_status;
  v_office_type public.company_office_type;
  v_lease_expiry date;
  v_action text := 'company_onboarding_section_saved';
begin
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
  end if;

  v_replay := public.prepare_company_onboarding_operation(
    p_actor_id, p_tenant_id, p_company_id, p_expected_onboarding_version,
    p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  if exists (
    select 1 from public.company_profiles
    where id = p_company_id and onboarding_status = 'completed'
  ) and not v_complete then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_NOT_SUBMITTABLE';
  end if;

  if p_section = 'legal' then
    update public.company_profiles set
      company_name = pg_catalog.btrim(p_payload ->> 'company_name'),
      display_name = nullif(pg_catalog.btrim(p_payload ->> 'display_name'), ''),
      jurisdiction_type = (p_payload ->> 'jurisdiction_type')::public.company_jurisdiction_type,
      licensing_authority = nullif(pg_catalog.btrim(p_payload ->> 'licensing_authority'), ''),
      legal_structure = nullif(p_payload ->> 'legal_structure', ''),
      trade_license_no = nullif(pg_catalog.upper(pg_catalog.btrim(p_payload ->> 'trade_license_no')), ''),
      license_expiry = nullif(p_payload ->> 'license_expiry', '')::date
    where id = p_company_id;
    if v_complete and exists (
      select 1 from public.company_profiles where id = p_company_id and (
        company_name is null or jurisdiction_type is null or licensing_authority is null
        or legal_structure is null or trade_license_no is null or license_expiry is null
      )
    ) then raise exception using errcode = '22023', message = 'SECTION_NOT_COMPLETABLE'; end if;

  elsif p_section = 'shareholders' then
    if pg_catalog.jsonb_typeof(p_payload -> 'shareholders') <> 'array' then
      raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
    end if;
    perform 1 from public.company_shareholders
      where company_id = p_company_id order by id for update;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'shareholders') loop
      v_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
      if exists (select 1 from public.company_shareholders where id = v_id and company_id <> p_company_id) then
        raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
      end if;
      v_ids := pg_catalog.array_append(v_ids, v_id);
      insert into public.company_shareholders (
        id, tenant_id, company_id, kind, full_name, nationality_code,
        passport_no_encrypted, passport_no_hash, passport_no_last4,
        legal_name, country_of_incorporation, registration_no_encrypted,
        registration_no_hash, registration_no_last4, ownership_percent, sort_order
      ) values (
        v_id, p_tenant_id, p_company_id, (v_item ->> 'kind')::public.company_shareholder_kind,
        nullif(pg_catalog.btrim(v_item ->> 'full_name'), ''), pg_catalog.upper(v_item ->> 'nationality_code'),
        v_item ->> 'passport_no_encrypted', v_item ->> 'passport_no_hash', pg_catalog.upper(v_item ->> 'passport_no_last4'),
        nullif(pg_catalog.btrim(v_item ->> 'legal_name'), ''), pg_catalog.upper(v_item ->> 'country_of_incorporation'),
        v_item ->> 'registration_no_encrypted', v_item ->> 'registration_no_hash', pg_catalog.upper(v_item ->> 'registration_no_last4'),
        (v_item ->> 'ownership_percent')::numeric(7,4), (v_item ->> 'sort_order')::integer
      ) on conflict (id) do update set
        kind = excluded.kind, full_name = excluded.full_name,
        nationality_code = excluded.nationality_code,
        passport_no_encrypted = case when excluded.kind = 'individual'
          then coalesce(excluded.passport_no_encrypted, company_shareholders.passport_no_encrypted) else null end,
        passport_no_hash = case when excluded.kind = 'individual'
          then coalesce(excluded.passport_no_hash, company_shareholders.passport_no_hash) else null end,
        passport_no_last4 = case when excluded.kind = 'individual'
          then coalesce(excluded.passport_no_last4, company_shareholders.passport_no_last4) else null end,
        legal_name = excluded.legal_name,
        country_of_incorporation = excluded.country_of_incorporation,
        registration_no_encrypted = case when excluded.kind = 'company'
          then coalesce(excluded.registration_no_encrypted, company_shareholders.registration_no_encrypted) else null end,
        registration_no_hash = case when excluded.kind = 'company'
          then coalesce(excluded.registration_no_hash, company_shareholders.registration_no_hash) else null end,
        registration_no_last4 = case when excluded.kind = 'company'
          then coalesce(excluded.registration_no_last4, company_shareholders.registration_no_last4) else null end,
        ownership_percent = excluded.ownership_percent, sort_order = excluded.sort_order;
    end loop;
    delete from public.company_shareholders
    where company_id = p_company_id and not (id = any(v_ids));
    if (select coalesce(sum(ownership_percent), 0) from public.company_shareholders where company_id = p_company_id) > 100
       or (v_complete and (
         select count(*) = 0 or coalesce(sum(ownership_percent), 0) <> 100
         from public.company_shareholders where company_id = p_company_id
       )) then raise exception using errcode = '22023', message = 'SECTION_NOT_COMPLETABLE'; end if;
    v_action := 'company_shareholders_replaced';

  elsif p_section = 'activities' then
    if pg_catalog.jsonb_typeof(p_payload -> 'activities') <> 'array' then
      raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
    end if;
    perform 1 from public.company_registered_activities
      where company_id = p_company_id order by id for update;
    for v_item in select value from pg_catalog.jsonb_array_elements(p_payload -> 'activities') loop
      v_id := coalesce(nullif(v_item ->> 'id', '')::uuid, gen_random_uuid());
      if exists (select 1 from public.company_registered_activities where id = v_id and company_id <> p_company_id) then
        raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
      end if;
      v_ids := pg_catalog.array_append(v_ids, v_id);
      insert into public.company_registered_activities (
        id, tenant_id, company_id, activity_code, activity_name,
        authority_name, is_primary, sort_order
      ) values (
        v_id, p_tenant_id, p_company_id, pg_catalog.upper(v_item ->> 'activity_code'),
        pg_catalog.btrim(v_item ->> 'activity_name'), pg_catalog.btrim(v_item ->> 'authority_name'),
        (v_item ->> 'is_primary')::boolean, (v_item ->> 'sort_order')::integer
      ) on conflict (id) do update set
        activity_code = excluded.activity_code, activity_name = excluded.activity_name,
        authority_name = excluded.authority_name, is_primary = excluded.is_primary,
        sort_order = excluded.sort_order;
    end loop;
    delete from public.company_registered_activities
    where company_id = p_company_id and not (id = any(v_ids));
    if (select count(*) filter (where is_primary) from public.company_registered_activities where company_id = p_company_id) > 1
       or (v_complete and (
         select count(*) = 0 or count(*) filter (where is_primary) <> 1
         from public.company_registered_activities where company_id = p_company_id
       )) then raise exception using errcode = '22023', message = 'SECTION_NOT_COMPLETABLE'; end if;
    v_action := 'company_activities_replaced';

  elsif p_section = 'office' then
    perform 1 from public.company_office_details where company_id = p_company_id for update;
    v_office_type := (p_payload ->> 'office_type')::public.company_office_type;
    v_lease_expiry := nullif(p_payload ->> 'lease_expiry', '')::date;
    insert into public.company_office_details (
      tenant_id, company_id, office_type, address_line_1, address_line_2, area,
      city, emirate, postal_code, country_code, provider_name, lease_reference, lease_expiry
    ) values (
      p_tenant_id, p_company_id, v_office_type,
      nullif(pg_catalog.btrim(p_payload ->> 'address_line_1'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'address_line_2'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'area'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'city'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'emirate'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'postal_code'), ''), 'AE',
      nullif(pg_catalog.btrim(p_payload ->> 'provider_name'), ''),
      nullif(pg_catalog.btrim(p_payload ->> 'lease_reference'), ''), v_lease_expiry
    ) on conflict (company_id) do update set
      office_type = excluded.office_type, address_line_1 = excluded.address_line_1,
      address_line_2 = excluded.address_line_2, area = excluded.area, city = excluded.city,
      emirate = excluded.emirate, postal_code = excluded.postal_code,
      provider_name = excluded.provider_name, lease_reference = excluded.lease_reference,
      lease_expiry = excluded.lease_expiry;
    if v_lease_expiry is not null then
      insert into public.renewals (tenant_id, company_id, type, label, due_date, status, source)
      values (p_tenant_id, p_company_id, 'ejari', 'Office lease', v_lease_expiry, 'upcoming', 'company_onboarding')
      on conflict (tenant_id, company_id, type) where source = 'company_onboarding'
      do update set due_date = excluded.due_date, status = 'upcoming', completed_at = null;
    else
      update public.renewals set status = 'cancelled'
      where tenant_id = p_tenant_id and company_id = p_company_id
        and type = 'ejari' and source = 'company_onboarding';
    end if;

  elsif p_section = 'establishment' then
    update public.company_profiles set
      establishment_card_no_encrypted = coalesce(
        nullif(p_payload ->> 'card_no_encrypted', ''), establishment_card_no_encrypted),
      establishment_card_no_hash = coalesce(
        nullif(p_payload ->> 'card_no_hash', ''), establishment_card_no_hash),
      establishment_card_no_last4 = coalesce(
        nullif(pg_catalog.upper(p_payload ->> 'card_no_last4'), ''), establishment_card_no_last4),
      establishment_card_expiry = nullif(p_payload ->> 'card_expiry', '')::date
    where id = p_company_id;
    if v_complete and exists (
      select 1 from public.company_profiles where id = p_company_id and (
        establishment_card_no_encrypted is null or establishment_card_no_hash is null
        or establishment_card_no_last4 is null or establishment_card_expiry is null
      )
    ) then raise exception using errcode = '22023', message = 'SECTION_NOT_COMPLETABLE'; end if;

  elsif p_section = 'bank' then
    perform 1 from public.company_bank_details where company_id = p_company_id for update;
    insert into public.company_bank_details (
      tenant_id, company_id, bank_name, branch_name, account_holder_name, currency_code,
      swift_bic, iban_encrypted, iban_hash, iban_last4,
      account_number_encrypted, account_number_hash, account_number_last4
    ) values (
      p_tenant_id, p_company_id, pg_catalog.btrim(p_payload ->> 'bank_name'),
      nullif(pg_catalog.btrim(p_payload ->> 'branch_name'), ''),
      pg_catalog.btrim(p_payload ->> 'account_holder_name'), 'AED',
      nullif(pg_catalog.upper(p_payload ->> 'swift_bic'), ''),
      nullif(p_payload ->> 'iban_encrypted', ''), nullif(p_payload ->> 'iban_hash', ''),
      nullif(p_payload ->> 'iban_last4', ''),
      nullif(p_payload ->> 'account_number_encrypted', ''),
      nullif(p_payload ->> 'account_number_hash', ''),
      nullif(pg_catalog.upper(p_payload ->> 'account_number_last4'), '')
    ) on conflict (company_id) do update set
      bank_name = excluded.bank_name, branch_name = excluded.branch_name,
      account_holder_name = excluded.account_holder_name, currency_code = excluded.currency_code,
      swift_bic = coalesce(excluded.swift_bic, company_bank_details.swift_bic),
      iban_encrypted = coalesce(excluded.iban_encrypted, company_bank_details.iban_encrypted),
      iban_hash = coalesce(excluded.iban_hash, company_bank_details.iban_hash),
      iban_last4 = coalesce(excluded.iban_last4, company_bank_details.iban_last4),
      account_number_encrypted = coalesce(excluded.account_number_encrypted, company_bank_details.account_number_encrypted),
      account_number_hash = coalesce(excluded.account_number_hash, company_bank_details.account_number_hash),
      account_number_last4 = coalesce(excluded.account_number_last4, company_bank_details.account_number_last4);
    if v_complete and exists (
      select 1 from public.company_bank_details where company_id = p_company_id
        and (iban_encrypted is null and account_number_encrypted is null)
    ) then raise exception using errcode = '22023', message = 'SECTION_NOT_COMPLETABLE'; end if;
    v_action := 'company_bank_identifier_updated';
  else
    raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
  end if;

  update public.company_onboarding_sections set
    status = case
      when v_complete then 'complete'::public.company_onboarding_section_status
      else 'incomplete'::public.company_onboarding_section_status
    end,
    completed_at = case when v_complete then pg_catalog.now() else null end,
    completed_by_profile_id = case when v_complete then p_actor_id else null end
  where company_id = p_company_id and section_key = p_section;

  update public.company_profiles set
    onboarding_status = case
      when onboarding_status = 'completed' then 'completed'::public.company_onboarding_status
      else 'in_progress'::public.company_onboarding_status
    end,
    onboarding_version = onboarding_version + 1
  where id = p_company_id
  returning onboarding_version, onboarding_status into v_version, v_lifecycle;

  if v_complete and v_action = 'company_onboarding_section_saved' then
    v_action := 'company_onboarding_section_completed';
  end if;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, v_action, 'self_serve', pg_catalog.jsonb_build_object(
    'company_id', p_company_id, 'section', p_section, 'operation_id', p_operation_id,
    'version', v_version
  ));

  v_result := pg_catalog.jsonb_build_object(
    'company_id', p_company_id, 'section', p_section, 'section_status',
    case when v_complete then 'complete' else 'incomplete' end,
    'onboarding_status', v_lifecycle, 'onboarding_version', v_version
  );
  perform public.record_company_onboarding_operation(
    p_tenant_id, p_company_id, p_operation_id, 'save_' || p_section::text,
    p_payload_hash, v_result, v_version
  );
  return v_result;
exception
  when invalid_text_representation or check_violation or unique_violation or not_null_violation then
    raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
end;
$$;

revoke all on function public.save_company_onboarding_section_internal(
  public.company_onboarding_section_key, uuid, uuid, uuid, bigint, uuid, text, jsonb
) from public, anon, authenticated;

create or replace function public.save_company_legal_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('legal', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;
create or replace function public.save_company_shareholders_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('shareholders', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;
create or replace function public.save_company_activities_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('activities', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;
create or replace function public.save_company_office_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('office', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;
create or replace function public.save_company_establishment_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('establishment', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;
create or replace function public.save_company_bank_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language sql security definer set search_path = '' as $$
  select public.save_company_onboarding_section_internal('bank', p_actor_id, p_tenant_id,
    p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash, p_payload);
$$;

create or replace function public.clear_company_bank_identifier(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_version bigint; v_identifier text;
begin
  v_replay := public.prepare_company_onboarding_operation(
    p_actor_id, p_tenant_id, p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  if exists (
    select 1 from public.company_profiles
    where id = p_company_id and onboarding_status = 'completed'
  ) then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_NOT_SUBMITTABLE';
  end if;
  v_identifier := p_payload ->> 'identifier';
  if v_identifier = 'iban' then
    update public.company_bank_details set iban_encrypted = null, iban_hash = null, iban_last4 = null
    where company_id = p_company_id;
  elsif v_identifier = 'account_number' then
    update public.company_bank_details set account_number_encrypted = null,
      account_number_hash = null, account_number_last4 = null where company_id = p_company_id;
  else raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT'; end if;
  update public.company_onboarding_sections set status = 'incomplete', completed_at = null,
    completed_by_profile_id = null where company_id = p_company_id and section_key = 'bank';
  update public.company_profiles set onboarding_status = case when onboarding_status = 'completed'
    then 'completed'::public.company_onboarding_status else 'in_progress' end,
    onboarding_version = onboarding_version + 1 where id = p_company_id
    returning onboarding_version into v_version;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'company_bank_identifier_cleared', 'self_serve',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'identifier', v_identifier,
      'operation_id', p_operation_id, 'version', v_version));
  v_result := pg_catalog.jsonb_build_object('company_id', p_company_id,
    'identifier', v_identifier, 'onboarding_version', v_version);
  perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
    'clear_bank_identifier', p_payload_hash, v_result, v_version);
  return v_result;
end; $$;

create or replace function public.reopen_company_onboarding_section(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_version bigint;
  v_section public.company_onboarding_section_key; v_reason text;
begin
  v_replay := public.prepare_company_onboarding_operation(
    p_actor_id, p_tenant_id, p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.profiles where id = p_actor_id and role in ('admin', 'super_admin')
    and status = 'active' and tenant_id is null;
  if not found then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  v_section := (p_payload ->> 'section')::public.company_onboarding_section_key;
  v_reason := pg_catalog.btrim(p_payload ->> 'reason');
  if char_length(v_reason) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_SECTION_INPUT';
  end if;
  update public.company_onboarding_sections set status = 'incomplete', completed_at = null,
    completed_by_profile_id = null where company_id = p_company_id and section_key = v_section;
  update public.company_profiles set onboarding_status = 'in_progress',
    status = case when status = 'active' then 'onboarding'::public.company_status else status end,
    onboarding_version = onboarding_version + 1 where id = p_company_id
    returning onboarding_version into v_version;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'company_onboarding_section_reopened', 'admin',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'section', v_section,
      'reason', v_reason, 'operation_id', p_operation_id, 'version', v_version));
  v_result := pg_catalog.jsonb_build_object('company_id', p_company_id, 'section', v_section,
    'onboarding_status', 'in_progress', 'onboarding_version', v_version);
  perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
    'reopen_section', p_payload_hash, v_result, v_version);
  return v_result;
end; $$;

create or replace function public.submit_company_onboarding_for_activation(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_version bigint; v_requirements jsonb;
begin
  v_replay := public.prepare_company_onboarding_operation(
    p_actor_id, p_tenant_id, p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'code', code, 'section', section, 'state', state)), '[]'::jsonb)
    into v_requirements from public.evaluate_company_activation_readiness(p_company_id);
  if pg_catalog.jsonb_array_length(v_requirements) > 0 then
    v_result := pg_catalog.jsonb_build_object('company_id', p_company_id, 'ready', false,
      'requirements', v_requirements, 'onboarding_version', p_expected_onboarding_version);
    perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
      'submit_onboarding', p_payload_hash, v_result, p_expected_onboarding_version);
    return v_result;
  end if;
  update public.company_profiles set onboarding_status = 'ready_for_activation',
    onboarding_version = onboarding_version + 1 where id = p_company_id
    returning onboarding_version into v_version;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'company_onboarding_submitted', 'self_serve',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'operation_id', p_operation_id,
      'version', v_version));
  v_result := pg_catalog.jsonb_build_object('company_id', p_company_id, 'ready', true,
    'requirements', '[]'::jsonb, 'onboarding_version', v_version);
  perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
    'submit_onboarding', p_payload_hash, v_result, v_version);
  return v_result;
end; $$;

create or replace function public.activate_company_onboarding(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_expected_onboarding_version bigint, p_operation_id uuid,
  p_payload_hash text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_result jsonb; v_version bigint; v_requirements jsonb;
begin
  v_replay := public.prepare_company_onboarding_operation(
    p_actor_id, p_tenant_id, p_company_id, p_expected_onboarding_version, p_operation_id, p_payload_hash
  );
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.company_onboarding_sections where company_id = p_company_id
    order by section_key for update;
  perform 1 from public.company_shareholders where company_id = p_company_id order by id for update;
  perform 1 from public.company_registered_activities where company_id = p_company_id order by id for update;
  perform 1 from public.company_office_details where company_id = p_company_id for update;
  perform 1 from public.company_bank_details where company_id = p_company_id for update;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'code', code, 'section', section, 'state', state)), '[]'::jsonb)
    into v_requirements from public.evaluate_company_activation_readiness(p_company_id);
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'company_activation_attempted', 'self_serve',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'operation_id', p_operation_id,
      'requirement_count', pg_catalog.jsonb_array_length(v_requirements)));
  if pg_catalog.jsonb_array_length(v_requirements) > 0 then
    v_result := pg_catalog.jsonb_build_object('company_id', p_company_id, 'activated', false,
      'requirements', v_requirements, 'onboarding_version', p_expected_onboarding_version);
    perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
      'activate_onboarding', p_payload_hash, v_result, p_expected_onboarding_version);
    return v_result;
  end if;
  perform 1 from public.company_profiles where id = p_company_id
    and onboarding_status = 'ready_for_activation';
  if not found then raise exception using errcode = 'P0001', message = 'ONBOARDING_NOT_SUBMITTABLE'; end if;
  update public.company_profiles set onboarding_status = 'completed', status = 'active',
    activated_at = pg_catalog.now(), activated_by_profile_id = p_actor_id,
    onboarding_version = onboarding_version + 1 where id = p_company_id
    returning onboarding_version into v_version;
  update public.tenants set status = 'active' where id = p_tenant_id;
  insert into public.tenant_audit_log (tenant_id, actor_id, action, source, details)
  values (p_tenant_id, p_actor_id, 'company_activated', 'self_serve',
    pg_catalog.jsonb_build_object('company_id', p_company_id, 'operation_id', p_operation_id,
      'version', v_version));
  v_result := pg_catalog.jsonb_build_object('company_id', p_company_id, 'activated', true,
    'requirements', '[]'::jsonb, 'onboarding_version', v_version);
  perform public.record_company_onboarding_operation(p_tenant_id, p_company_id, p_operation_id,
    'activate_onboarding', p_payload_hash, v_result, v_version);
  return v_result;
end; $$;

create or replace function public.read_company_onboarding(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_allowed boolean; v_result jsonb;
begin
  select exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_id and profile.status = 'active' and (
      (profile.role in ('admin', 'super_admin') and profile.tenant_id is null)
      or (profile.role = 'pro' and exists (
        select 1 from public.pro_company_assignments assignment
        join public.pro_profiles pro on pro.profile_id = assignment.pro_profile_id
        where assignment.pro_profile_id = profile.id and assignment.tenant_id = p_tenant_id
          and assignment.company_id = p_company_id and assignment.status = 'active'
          and pro.credentials_verified = true
      ))
    )
  ) into v_allowed;
  if not v_allowed then raise exception using errcode = '42501', message = 'FORBIDDEN'; end if;
  select pg_catalog.jsonb_build_object(
    'company_id', company.id, 'tenant_id', company.tenant_id,
    'company_name', company.company_name, 'display_name', company.display_name,
    'company_status', company.status,
    'jurisdiction_type', company.jurisdiction_type,
    'licensing_authority', company.licensing_authority,
    'legal_structure', company.legal_structure, 'trade_license_no', company.trade_license_no,
    'license_expiry', company.license_expiry,
    'establishment_card_last4', company.establishment_card_no_last4,
    'establishment_card_expiry', company.establishment_card_expiry,
    'onboarding_status', company.onboarding_status,
    'onboarding_version', company.onboarding_version,
    'shareholders', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', shareholder.id,
        'kind', shareholder.kind,
        'full_name', shareholder.full_name,
        'nationality_code', shareholder.nationality_code,
        'passport_masked', case when shareholder.passport_no_last4 is null then null
          else '•••• ' || shareholder.passport_no_last4 end,
        'legal_name', shareholder.legal_name,
        'country_of_incorporation', shareholder.country_of_incorporation,
        'registration_masked', case when shareholder.registration_no_last4 is null then null
          else '•••• ' || shareholder.registration_no_last4 end,
        'ownership_percent', shareholder.ownership_percent::text,
        'sort_order', shareholder.sort_order
      ) order by shareholder.sort_order, shareholder.id)
      from public.company_shareholders shareholder
      where shareholder.tenant_id = p_tenant_id and shareholder.company_id = p_company_id
    ), '[]'::jsonb),
    'activities', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', activity.id,
        'activity_code', activity.activity_code,
        'activity_name', activity.activity_name,
        'authority_name', activity.authority_name,
        'is_primary', activity.is_primary,
        'sort_order', activity.sort_order
      ) order by activity.sort_order, activity.id)
      from public.company_registered_activities activity
      where activity.tenant_id = p_tenant_id and activity.company_id = p_company_id
    ), '[]'::jsonb),
    'office', case when office.company_id is null then null else pg_catalog.jsonb_build_object(
      'office_type', office.office_type,
      'address_line_1', office.address_line_1,
      'address_line_2', office.address_line_2,
      'area', office.area,
      'city', office.city,
      'emirate', office.emirate,
      'postal_code', office.postal_code,
      'country_code', office.country_code,
      'provider_name', office.provider_name,
      'lease_reference', office.lease_reference,
      'lease_expiry', office.lease_expiry
    ) end,
    'bank', case when bank.company_id is null then null else pg_catalog.jsonb_build_object(
      'bank_name', bank.bank_name, 'branch_name', bank.branch_name,
      'account_holder_name', bank.account_holder_name, 'currency_code', bank.currency_code,
      'swift_bic_masked', case when bank.swift_bic is null then null
        else '•••• ' || pg_catalog.right(bank.swift_bic, 4) end,
      'iban_masked', case when bank.iban_last4 is null then null else '•••• ' || bank.iban_last4 end,
      'account_number_masked', case when bank.account_number_last4 is null then null else '•••• ' || bank.account_number_last4 end
    ) end,
    'sections', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'section_key', section.section_key,
        'status', section.status,
        'completed_at', section.completed_at
      ) order by pg_catalog.array_position(
        pg_catalog.enum_range(null::public.company_onboarding_section_key), section.section_key
      ))
      from public.company_onboarding_sections section
      where section.tenant_id = p_tenant_id and section.company_id = p_company_id
    ), '[]'::jsonb),
    'requirements', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'code', readiness.code, 'section', readiness.section, 'state', readiness.state
      ))
      from public.evaluate_company_activation_readiness(p_company_id) readiness
    ), '[]'::jsonb)
  ) into v_result
  from public.company_profiles company
  left join public.company_office_details office
    on office.tenant_id = company.tenant_id and office.company_id = company.id
  left join public.company_bank_details bank
    on bank.tenant_id = company.tenant_id and bank.company_id = company.id
  where company.id = p_company_id and company.tenant_id = p_tenant_id;
  if v_result is null then raise exception using errcode = 'P0001', message = 'COMPANY_NOT_FOUND'; end if;
  return v_result;
end; $$;

create or replace function public.cleanup_company_onboarding_operations()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  delete from public.company_onboarding_operations
  where created_at < pg_catalog.now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end; $$;

revoke all on function public.cleanup_company_onboarding_operations()
  from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'company-onboarding-operation-cleanup';
exception when others then null; end $$;
select cron.schedule(
  'company-onboarding-operation-cleanup', '30 2 * * *',
  $cron$select public.cleanup_company_onboarding_operations()$cron$
);

revoke all on function public.save_company_legal_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_company_shareholders_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_company_activities_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_company_office_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_company_establishment_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_company_bank_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.clear_company_bank_identifier(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.reopen_company_onboarding_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_company_onboarding_for_activation(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.activate_company_onboarding(uuid, uuid, uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_company_legal_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.save_company_shareholders_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.save_company_activities_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.save_company_office_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.save_company_establishment_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.save_company_bank_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.clear_company_bank_identifier(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.reopen_company_onboarding_section(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.submit_company_onboarding_for_activation(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.activate_company_onboarding(uuid, uuid, uuid, bigint, uuid, text, jsonb) to service_role;

revoke all on function public.read_company_onboarding(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.read_company_onboarding(uuid, uuid, uuid) to service_role;

-- The superseded Step 1 mutation references the renamed jurisdiction column.
revoke all on function public.update_assigned_company_profile(
  uuid, uuid, uuid, timestamptz, text, text, text, date
) from public, anon, authenticated, service_role;

commit;
