-- Normalize the resumable company-onboarding record without fabricating completion.
begin;

create type public.company_jurisdiction_type as enum ('mainland', 'free_zone', 'offshore');
create type public.company_onboarding_status as enum (
  'not_started',
  'in_progress',
  'ready_for_activation',
  'completed'
);
create type public.company_shareholder_kind as enum ('individual', 'company');
create type public.company_office_type as enum ('physical', 'flexi_desk', 'virtual');
create type public.company_onboarding_section_key as enum (
  'legal',
  'shareholders',
  'activities',
  'office',
  'establishment',
  'bank'
);
create type public.company_onboarding_section_status as enum ('incomplete', 'complete');

alter table public.company_profiles rename column jurisdiction to licensing_authority;
alter table public.company_profiles
  add column display_name text,
  add column jurisdiction_type public.company_jurisdiction_type,
  add column legal_structure text,
  add column establishment_card_no_encrypted text,
  add column establishment_card_no_hash text,
  add column establishment_card_no_last4 text,
  add column establishment_card_expiry date,
  add column onboarding_status public.company_onboarding_status not null default 'not_started',
  add column onboarding_version bigint not null default 0,
  add column activated_at timestamptz,
  add column activated_by_profile_id uuid references public.profiles(id) on delete restrict,
  add constraint company_profiles_company_name_shape
    check (char_length(pg_catalog.btrim(company_name)) between 2 and 200),
  add constraint company_profiles_display_name_shape
    check (
      display_name is null
      or char_length(pg_catalog.btrim(display_name)) between 2 and 160
    ),
  add constraint company_profiles_licensing_authority_shape
    check (
      licensing_authority is null
      or char_length(pg_catalog.btrim(licensing_authority)) between 2 and 120
    ),
  add constraint company_profiles_legal_structure_shape
    check (
      legal_structure is null
      or legal_structure ~ '^[a-z][a-z0-9_]{1,63}$'
    ),
  add constraint company_profiles_trade_license_shape
    check (
      trade_license_no is null
      or (
        char_length(pg_catalog.btrim(trade_license_no)) between 2 and 64
        and pg_catalog.btrim(trade_license_no) ~ '^[A-Z0-9][A-Z0-9 /.-]*$'
      )
    ),
  add constraint company_profiles_establishment_card_shape
    check (
      (
        establishment_card_no_encrypted is null
        and establishment_card_no_hash is null
        and establishment_card_no_last4 is null
      )
      or (
        char_length(establishment_card_no_encrypted) > 0
        and establishment_card_no_hash ~ '^[0-9a-f]{64}$'
        and establishment_card_no_last4 ~ '^[A-Z0-9]{1,4}$'
      )
    ),
  add constraint company_profiles_activation_shape
    check (
      (activated_at is null and activated_by_profile_id is null)
      or (activated_at is not null and activated_by_profile_id is not null)
    ),
  add constraint company_profiles_onboarding_version_nonnegative
    check (onboarding_version >= 0);

do $$
declare
  v_duplicate_count integer;
begin
  select count(*) into v_duplicate_count
  from (
    select 1
    from public.company_profiles
    where trade_license_no is not null
      and licensing_authority is not null
    group by pg_catalog.lower(licensing_authority), pg_catalog.upper(trade_license_no)
    having count(*) > 1
  ) duplicates;
  if v_duplicate_count > 0 then
    raise exception using
      errcode = '23505',
      message = 'DUPLICATE_COMPANY_TRADE_LICENSE',
      detail = pg_catalog.format('duplicate_group_count=%s', v_duplicate_count);
  end if;
end;
$$;

create unique index company_profiles_trade_license_authority_uniq
  on public.company_profiles (
    pg_catalog.lower(licensing_authority),
    pg_catalog.upper(trade_license_no)
  )
  where trade_license_no is not null;
create unique index company_profiles_establishment_card_hash_uniq
  on public.company_profiles (establishment_card_no_hash)
  where establishment_card_no_hash is not null;

create table public.company_shareholders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  kind public.company_shareholder_kind not null,
  full_name text,
  nationality_code text,
  passport_no_encrypted text,
  passport_no_hash text,
  passport_no_last4 text,
  legal_name text,
  country_of_incorporation text,
  registration_no_encrypted text,
  registration_no_hash text,
  registration_no_last4 text,
  ownership_percent numeric(7,4) not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_shareholders_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_shareholders_ownership_shape
    check (ownership_percent > 0 and ownership_percent <= 100),
  constraint company_shareholders_sort_order_nonnegative check (sort_order >= 0),
  constraint company_shareholders_variant_shape check (
    (
      kind = 'individual'
      and full_name is not null
      and char_length(pg_catalog.btrim(full_name)) between 2 and 200
      and nationality_code ~ '^[A-Z]{2}$'
      and legal_name is null
      and country_of_incorporation is null
      and registration_no_encrypted is null
      and registration_no_hash is null
      and registration_no_last4 is null
      and (
        (
          passport_no_encrypted is null
          and passport_no_hash is null
          and passport_no_last4 is null
        )
        or (
          char_length(passport_no_encrypted) > 0
          and passport_no_hash ~ '^[0-9a-f]{64}$'
          and passport_no_last4 ~ '^[A-Z0-9]{1,4}$'
        )
      )
    )
    or (
      kind = 'company'
      and legal_name is not null
      and char_length(pg_catalog.btrim(legal_name)) between 2 and 200
      and country_of_incorporation ~ '^[A-Z]{2}$'
      and char_length(registration_no_encrypted) > 0
      and registration_no_hash ~ '^[0-9a-f]{64}$'
      and registration_no_last4 ~ '^[A-Z0-9]{1,4}$'
      and full_name is null
      and nationality_code is null
      and passport_no_encrypted is null
      and passport_no_hash is null
      and passport_no_last4 is null
    )
  )
);

create unique index company_shareholders_sort_order_uniq
  on public.company_shareholders(company_id, sort_order);
create unique index company_shareholders_passport_hash_uniq
  on public.company_shareholders(company_id, passport_no_hash)
  where passport_no_hash is not null;
create unique index company_shareholders_registration_hash_uniq
  on public.company_shareholders(company_id, registration_no_hash)
  where registration_no_hash is not null;
create index company_shareholders_tenant_company_idx
  on public.company_shareholders(tenant_id, company_id);

create table public.company_registered_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  activity_code text not null,
  activity_name text not null,
  authority_name text not null,
  is_primary boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_registered_activities_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_registered_activities_code_shape
    check (
      char_length(activity_code) between 2 and 64
      and activity_code ~ '^[A-Z0-9][A-Z0-9._/-]*$'
    ),
  constraint company_registered_activities_name_shape
    check (char_length(pg_catalog.btrim(activity_name)) between 2 and 200),
  constraint company_registered_activities_authority_shape
    check (char_length(pg_catalog.btrim(authority_name)) between 2 and 120),
  constraint company_registered_activities_sort_nonnegative check (sort_order >= 0)
);

create unique index company_registered_activities_identity_uniq
  on public.company_registered_activities(
    company_id,
    pg_catalog.lower(authority_name),
    pg_catalog.upper(activity_code)
  );
create unique index company_registered_activities_primary_uniq
  on public.company_registered_activities(company_id)
  where is_primary;
create unique index company_registered_activities_sort_order_uniq
  on public.company_registered_activities(company_id, sort_order);
create index company_registered_activities_tenant_company_idx
  on public.company_registered_activities(tenant_id, company_id);

create table public.company_office_details (
  company_id uuid primary key references public.company_profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  office_type public.company_office_type not null,
  address_line_1 text,
  address_line_2 text,
  area text,
  city text,
  emirate text,
  postal_code text,
  country_code text not null default 'AE',
  provider_name text,
  lease_reference text,
  lease_expiry date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_office_details_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_office_details_country_check check (country_code = 'AE'),
  constraint company_office_details_lease_pair check (
    office_type <> 'virtual'
    or (lease_reference is null) = (lease_expiry is null)
  ),
  constraint company_office_details_text_lengths check (
    (address_line_1 is null or char_length(pg_catalog.btrim(address_line_1)) between 2 and 200)
    and (address_line_2 is null or char_length(pg_catalog.btrim(address_line_2)) between 2 and 200)
    and (area is null or char_length(pg_catalog.btrim(area)) between 2 and 120)
    and (city is null or char_length(pg_catalog.btrim(city)) between 2 and 120)
    and (emirate is null or char_length(pg_catalog.btrim(emirate)) between 2 and 120)
    and (postal_code is null or char_length(pg_catalog.btrim(postal_code)) <= 20)
    and (provider_name is null or char_length(pg_catalog.btrim(provider_name)) between 2 and 120)
    and (lease_reference is null or char_length(pg_catalog.btrim(lease_reference)) between 2 and 120)
  )
);

create unique index company_office_details_tenant_company_uniq
  on public.company_office_details(tenant_id, company_id);

create table public.company_bank_details (
  company_id uuid primary key references public.company_profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_name text not null,
  branch_name text,
  account_holder_name text not null,
  currency_code text not null default 'AED',
  swift_bic text,
  iban_encrypted text,
  iban_hash text,
  iban_last4 text,
  account_number_encrypted text,
  account_number_hash text,
  account_number_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_bank_details_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_bank_details_metadata_shape check (
    char_length(pg_catalog.btrim(bank_name)) between 2 and 120
    and (branch_name is null or char_length(pg_catalog.btrim(branch_name)) between 2 and 120)
    and char_length(pg_catalog.btrim(account_holder_name)) between 2 and 200
    and currency_code = 'AED'
    and (swift_bic is null or swift_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$')
  ),
  constraint company_bank_details_iban_shape check (
    (iban_encrypted is null and iban_hash is null and iban_last4 is null)
    or (
      char_length(iban_encrypted) > 0
      and iban_hash ~ '^[0-9a-f]{64}$'
      and iban_last4 ~ '^[0-9]{4}$'
    )
  ),
  constraint company_bank_details_account_shape check (
    (
      account_number_encrypted is null
      and account_number_hash is null
      and account_number_last4 is null
    )
    or (
      char_length(account_number_encrypted) > 0
      and account_number_hash ~ '^[0-9a-f]{64}$'
      and account_number_last4 ~ '^[A-Z0-9]{1,4}$'
    )
  ),
  constraint company_bank_details_identifier_required check (
    iban_encrypted is not null or account_number_encrypted is not null
  )
);

create unique index company_bank_details_tenant_company_uniq
  on public.company_bank_details(tenant_id, company_id);
create unique index company_bank_details_iban_hash_uniq
  on public.company_bank_details(iban_hash)
  where iban_hash is not null;
create unique index company_bank_details_account_hash_uniq
  on public.company_bank_details(account_number_hash)
  where account_number_hash is not null;

create table public.company_onboarding_sections (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  section_key public.company_onboarding_section_key not null,
  status public.company_onboarding_section_status not null default 'incomplete',
  completed_at timestamptz,
  completed_by_profile_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, section_key),
  constraint company_onboarding_sections_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_onboarding_sections_completion_shape check (
    (status = 'incomplete' and completed_at is null and completed_by_profile_id is null)
    or (status = 'complete' and completed_at is not null and completed_by_profile_id is not null)
  )
);

create index company_onboarding_sections_tenant_company_idx
  on public.company_onboarding_sections(tenant_id, company_id, section_key);

create table public.company_onboarding_operations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null,
  payload_hash text not null,
  result jsonb not null,
  committed_version bigint not null,
  created_at timestamptz not null default now(),
  primary key (company_id, operation_id),
  constraint company_onboarding_operations_company_tenant_fk
    foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id)
    on delete cascade,
  constraint company_onboarding_operations_kind_shape
    check (operation_kind ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint company_onboarding_operations_payload_hash_shape
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint company_onboarding_operations_version_nonnegative check (committed_version >= 0),
  constraint company_onboarding_operations_result_object
    check (pg_catalog.jsonb_typeof(result) = 'object')
);

create index company_onboarding_operations_created_at_idx
  on public.company_onboarding_operations(created_at);
create index company_onboarding_operations_tenant_company_idx
  on public.company_onboarding_operations(tenant_id, company_id);

-- Validate bridge JSON before copying. The migration never guesses malformed or
-- plaintext protected values.
do $$
begin
  if exists (
    select 1
    from public.company_profiles profile
    where pg_catalog.jsonb_typeof(profile.shareholders) <> 'array'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(profile.shareholders) item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or coalesce(item ->> 'kind', '') not in ('individual', 'company')
          or coalesce(item ->> 'ownership_percent', '') !~ '^(0|[1-9][0-9]{0,2})[.][0-9]{4}$'
          or coalesce(item ->> 'sort_order', '') !~ '^[0-9]+$'
          or (
            item ->> 'kind' = 'individual'
            and (
              char_length(pg_catalog.btrim(coalesce(item ->> 'full_name', ''))) not between 2 and 200
              or pg_catalog.upper(coalesce(item ->> 'nationality_code', '')) !~ '^[A-Z]{2}$'
              or item ? 'passport_number'
            )
          )
          or (
            item ->> 'kind' = 'company'
            and (
              char_length(pg_catalog.btrim(coalesce(item ->> 'legal_name', ''))) not between 2 and 200
              or pg_catalog.upper(coalesce(item ->> 'country_of_incorporation', '')) !~ '^[A-Z]{2}$'
              or coalesce(item ->> 'registration_no_encrypted', '') = ''
              or coalesce(item ->> 'registration_no_hash', '') !~ '^[0-9a-f]{64}$'
              or coalesce(item ->> 'registration_no_last4', '') !~ '^[A-Z0-9]{1,4}$'
            )
          )
      )
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;

  if exists (
    select 1
    from public.company_profiles profile
    where pg_catalog.jsonb_typeof(profile.registered_activities) <> 'array'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(profile.registered_activities) item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or pg_catalog.upper(coalesce(item ->> 'activity_code', '')) !~ '^[A-Z0-9][A-Z0-9._/-]{1,63}$'
          or char_length(pg_catalog.btrim(coalesce(item ->> 'activity_name', ''))) not between 2 and 200
          or char_length(pg_catalog.btrim(coalesce(item ->> 'authority_name', ''))) not between 2 and 120
          or coalesce(item ->> 'sort_order', '') !~ '^[0-9]+$'
          or pg_catalog.jsonb_typeof(item -> 'is_primary') is distinct from 'boolean'
      )
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;

  if exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.shareholders) item
    group by profile.id, item ->> 'sort_order'
    having count(*) > 1
  ) or exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.shareholders) item
    where item ->> 'passport_no_hash' is not null
    group by profile.id, item ->> 'passport_no_hash'
    having count(*) > 1
  ) or exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.shareholders) item
    where item ->> 'registration_no_hash' is not null
    group by profile.id, item ->> 'registration_no_hash'
    having count(*) > 1
  ) or exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.shareholders) item
    group by profile.id
    having sum((item ->> 'ownership_percent')::numeric) > 100.0000
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;

  if exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.registered_activities) item
    group by profile.id, pg_catalog.lower(item ->> 'authority_name'), pg_catalog.upper(item ->> 'activity_code')
    having count(*) > 1
  ) or exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.registered_activities) item
    group by profile.id, item ->> 'sort_order'
    having count(*) > 1
  ) or exists (
    select 1
    from public.company_profiles profile
    cross join lateral pg_catalog.jsonb_array_elements(profile.registered_activities) item
    where (item ->> 'is_primary')::boolean
    group by profile.id
    having count(*) > 1
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;

  if exists (
    select 1
    from public.company_profiles profile
    where profile.office_address is not null
      and (
        pg_catalog.jsonb_typeof(profile.office_address) <> 'object'
        or coalesce(profile.office_address ->> 'office_type', '') not in ('physical', 'flexi_desk', 'virtual')
        or pg_catalog.upper(coalesce(profile.office_address ->> 'country_code', 'AE')) <> 'AE'
      )
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;

  if exists (
    select 1
    from public.company_profiles profile
    where profile.bank_details is not null
      and (
        pg_catalog.jsonb_typeof(profile.bank_details) <> 'object'
        or char_length(pg_catalog.btrim(coalesce(profile.bank_details ->> 'bank_name', ''))) not between 2 and 120
        or char_length(pg_catalog.btrim(coalesce(profile.bank_details ->> 'account_holder_name', ''))) not between 2 and 200
        or coalesce(profile.bank_details ->> 'currency_code', 'AED') <> 'AED'
        or (
          profile.bank_details ->> 'iban_encrypted' is null
          and profile.bank_details ->> 'account_number_encrypted' is null
        )
        or profile.bank_details ? 'iban'
        or profile.bank_details ? 'account_number'
        or (
          profile.bank_details ->> 'iban_encrypted' is not null
          and (
            coalesce(profile.bank_details ->> 'iban_hash', '') !~ '^[0-9a-f]{64}$'
            or coalesce(profile.bank_details ->> 'iban_last4', '') !~ '^[0-9]{4}$'
          )
        )
        or (
          profile.bank_details ->> 'account_number_encrypted' is not null
          and (
            coalesce(profile.bank_details ->> 'account_number_hash', '') !~ '^[0-9a-f]{64}$'
            or coalesce(profile.bank_details ->> 'account_number_last4', '') !~ '^[A-Z0-9]{1,4}$'
          )
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
  end if;
exception
  when others then
    raise exception using errcode = '23514', message = 'UNSUPPORTED_COMPANY_ONBOARDING_JSON';
end;
$$;

insert into public.company_shareholders (
  tenant_id,
  company_id,
  kind,
  full_name,
  nationality_code,
  passport_no_encrypted,
  passport_no_hash,
  passport_no_last4,
  legal_name,
  country_of_incorporation,
  registration_no_encrypted,
  registration_no_hash,
  registration_no_last4,
  ownership_percent,
  sort_order
)
select
  profile.tenant_id,
  profile.id,
  (item ->> 'kind')::public.company_shareholder_kind,
  case when item ->> 'kind' = 'individual' then pg_catalog.btrim(item ->> 'full_name') end,
  case when item ->> 'kind' = 'individual' then pg_catalog.upper(item ->> 'nationality_code') end,
  item ->> 'passport_no_encrypted',
  item ->> 'passport_no_hash',
  pg_catalog.upper(item ->> 'passport_no_last4'),
  case when item ->> 'kind' = 'company' then pg_catalog.btrim(item ->> 'legal_name') end,
  case when item ->> 'kind' = 'company' then pg_catalog.upper(item ->> 'country_of_incorporation') end,
  item ->> 'registration_no_encrypted',
  item ->> 'registration_no_hash',
  pg_catalog.upper(item ->> 'registration_no_last4'),
  (item ->> 'ownership_percent')::numeric(7,4),
  (item ->> 'sort_order')::integer
from public.company_profiles profile
cross join lateral pg_catalog.jsonb_array_elements(profile.shareholders) item;

insert into public.company_registered_activities (
  tenant_id,
  company_id,
  activity_code,
  activity_name,
  authority_name,
  is_primary,
  sort_order
)
select
  profile.tenant_id,
  profile.id,
  pg_catalog.upper(item ->> 'activity_code'),
  pg_catalog.btrim(item ->> 'activity_name'),
  pg_catalog.btrim(item ->> 'authority_name'),
  (item ->> 'is_primary')::boolean,
  (item ->> 'sort_order')::integer
from public.company_profiles profile
cross join lateral pg_catalog.jsonb_array_elements(profile.registered_activities) item;

insert into public.company_office_details (
  tenant_id,
  company_id,
  office_type,
  address_line_1,
  address_line_2,
  area,
  city,
  emirate,
  postal_code,
  country_code,
  provider_name,
  lease_reference,
  lease_expiry
)
select
  profile.tenant_id,
  profile.id,
  (profile.office_address ->> 'office_type')::public.company_office_type,
  nullif(pg_catalog.btrim(profile.office_address ->> 'address_line_1'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'address_line_2'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'area'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'city'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'emirate'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'postal_code'), ''),
  'AE',
  nullif(pg_catalog.btrim(profile.office_address ->> 'provider_name'), ''),
  nullif(pg_catalog.btrim(profile.office_address ->> 'lease_reference'), ''),
  nullif(profile.office_address ->> 'lease_expiry', '')::date
from public.company_profiles profile
where profile.office_address is not null;

insert into public.company_bank_details (
  tenant_id,
  company_id,
  bank_name,
  branch_name,
  account_holder_name,
  currency_code,
  swift_bic,
  iban_encrypted,
  iban_hash,
  iban_last4,
  account_number_encrypted,
  account_number_hash,
  account_number_last4
)
select
  profile.tenant_id,
  profile.id,
  pg_catalog.btrim(profile.bank_details ->> 'bank_name'),
  nullif(pg_catalog.btrim(profile.bank_details ->> 'branch_name'), ''),
  pg_catalog.btrim(profile.bank_details ->> 'account_holder_name'),
  'AED',
  nullif(pg_catalog.upper(profile.bank_details ->> 'swift_bic'), ''),
  profile.bank_details ->> 'iban_encrypted',
  profile.bank_details ->> 'iban_hash',
  profile.bank_details ->> 'iban_last4',
  profile.bank_details ->> 'account_number_encrypted',
  profile.bank_details ->> 'account_number_hash',
  pg_catalog.upper(profile.bank_details ->> 'account_number_last4')
from public.company_profiles profile
where profile.bank_details is not null;

update public.company_profiles
set onboarding_status = case
  when company_name is not null
    or trade_license_no is not null
    or license_expiry is not null
    or licensing_authority is not null
    or pg_catalog.jsonb_array_length(shareholders) > 0
    or pg_catalog.jsonb_array_length(registered_activities) > 0
    or office_address is not null
    or bank_details is not null
  then 'in_progress'::public.company_onboarding_status
  else 'not_started'::public.company_onboarding_status
end;

insert into public.company_onboarding_sections (tenant_id, company_id, section_key)
select profile.tenant_id, profile.id, section_key
from public.company_profiles profile
cross join pg_catalog.unnest(enum_range(null::public.company_onboarding_section_key)) section_key;

alter table public.company_profiles
  drop column shareholders,
  drop column registered_activities,
  drop column office_address,
  drop column bank_details;

alter table public.renewals drop constraint renewals_source_check;
alter table public.renewals
  add constraint renewals_source_check
  check (source in ('license_backfill', 'manual', 'company_onboarding'));
create unique index renewals_company_onboarding_uniq
  on public.renewals(tenant_id, company_id, type)
  where source = 'company_onboarding';

alter table public.tenant_audit_log drop constraint tenant_audit_log_action_check;
alter table public.tenant_audit_log
  add constraint tenant_audit_log_action_check
  check (action in (
    'created', 'approved', 'rejected', 'suspended', 'reactivated', 'updated', 'completed',
    'cancelled', 'unlocked', 'session_revoked', 'invoice_created', 'invoice_voided',
    'invoice_marked_paid', 'payment_initiated', 'payment_succeeded', 'payment_failed',
    'refund_issued', 'infected_blocked', 'reconciled', 'comms_skipped_opted_out',
    'lead_created', 'lead_assigned', 'lead_stage_changed', 'lead_note_added',
    'erasure_requested', 'erasure_verified', 'erasure_approved', 'erasure_rejected',
    'erasure_completed', 'bulk_imported', 'meeting_slot_created', 'meeting_scheduled',
    'meeting_cancelled', 'meeting_completed', 'meeting_recording_attached',
    'whatsapp_template_status_updated', 'service_case_created', 'service_case_updated',
    'company_pro_assigned', 'company_pro_released', 'company_onboarding_section_saved',
    'company_onboarding_section_completed', 'company_onboarding_section_reopened',
    'company_shareholders_replaced', 'company_activities_replaced',
    'company_bank_identifier_updated', 'company_bank_identifier_cleared',
    'company_onboarding_submitted', 'company_activation_attempted', 'company_activated'
  ));

drop trigger if exists company_shareholders_set_updated_at on public.company_shareholders;
create trigger company_shareholders_set_updated_at
  before update on public.company_shareholders
  for each row execute function public.set_updated_at();
drop trigger if exists company_registered_activities_set_updated_at
  on public.company_registered_activities;
create trigger company_registered_activities_set_updated_at
  before update on public.company_registered_activities
  for each row execute function public.set_updated_at();
drop trigger if exists company_office_details_set_updated_at on public.company_office_details;
create trigger company_office_details_set_updated_at
  before update on public.company_office_details
  for each row execute function public.set_updated_at();
drop trigger if exists company_bank_details_set_updated_at on public.company_bank_details;
create trigger company_bank_details_set_updated_at
  before update on public.company_bank_details
  for each row execute function public.set_updated_at();
drop trigger if exists company_onboarding_sections_set_updated_at
  on public.company_onboarding_sections;
create trigger company_onboarding_sections_set_updated_at
  before update on public.company_onboarding_sections
  for each row execute function public.set_updated_at();

alter table public.company_shareholders enable row level security;
alter table public.company_registered_activities enable row level security;
alter table public.company_office_details enable row level security;
alter table public.company_bank_details enable row level security;
alter table public.company_onboarding_sections enable row level security;
alter table public.company_onboarding_operations enable row level security;

revoke all on table public.company_shareholders from public, anon, authenticated;
revoke all on table public.company_registered_activities from public, anon, authenticated;
revoke all on table public.company_office_details from public, anon, authenticated;
revoke all on table public.company_bank_details from public, anon, authenticated;
revoke all on table public.company_onboarding_sections from public, anon, authenticated;
revoke all on table public.company_onboarding_operations from public, anon, authenticated;

commit;
