-- Step 24 — Public Cost Estimator baseline pricing data.
-- Amounts are AED minor units and intentionally estimate-grade seeds.

create table if not exists public.cost_data (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction in ('mainland', 'free_zone', 'offshore')),
  authority text not null,
  emirate text,
  activity_key text,
  fee_type text not null check (
    fee_type in (
      'license',
      'registration',
      'office_flexi',
      'office_physical',
      'office_virtual',
      'shareholder',
      'visa',
      'addon_bank_account',
      'addon_tax_registration',
      'addon_document_attestation'
    )
  ),
  label text not null,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'AED' check (currency = 'AED'),
  recurrence text not null check (recurrence in ('one_time', 'annual')),
  min_shareholders integer not null default 1 check (min_shareholders >= 1),
  max_shareholders integer not null default 50 check (max_shareholders between 1 and 50),
  min_visas integer not null default 0 check (min_visas between 0 and 200),
  max_visas integer not null default 200 check (max_visas between 0 and 200),
  timeline_min_days integer not null default 0 check (timeline_min_days >= 0),
  timeline_max_days integer not null default 0 check (timeline_max_days >= timeline_min_days),
  required_document_keys text[] not null default '{}',
  estimate_grade boolean not null default true,
  active boolean not null default true,
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_data_shareholders_range check (min_shareholders <= max_shareholders),
  constraint cost_data_visas_range check (min_visas <= max_visas),
  constraint cost_data_valid_range check (valid_to is null or valid_to >= valid_from)
);

alter table public.cost_data enable row level security;

create unique index if not exists cost_data_estimator_seed_key
  on public.cost_data (jurisdiction, authority, coalesce(emirate, ''), coalesce(activity_key, ''), fee_type, valid_from);

create index if not exists cost_data_active_lookup_idx
  on public.cost_data (jurisdiction, authority, active, valid_from, valid_to);

drop trigger if exists cost_data_set_updated_at on public.cost_data;
create trigger cost_data_set_updated_at before update on public.cost_data
  for each row execute function public.set_updated_at();

drop policy if exists cost_data_admin_all on public.cost_data;
create policy cost_data_admin_all on public.cost_data for all
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('super_admin', 'admin'));

with authority_seed(authority, jurisdiction, emirate, license_minor, registration_minor, office_flexi_minor) as (
  values
    ('Dubai DED', 'mainland', 'dubai', 1500000, 620000, 1200000),
    ('JAFZA', 'free_zone', 'dubai', 1650000, 900000, 1100000),
    ('DMCC', 'free_zone', 'dubai', 1250000, 850000, 900000),
    ('DIFC', 'free_zone', 'dubai', 2200000, 1300000, 1800000),
    ('Dubai South', 'free_zone', 'dubai', 1150000, 650000, 700000),
    ('Meydan Free Zone', 'free_zone', 'dubai', 1250000, 550000, 600000),
    ('IFZA', 'free_zone', 'dubai', 1290000, 600000, 650000),
    ('DAFZA', 'free_zone', 'dubai', 1800000, 950000, 1250000),
    ('Dubai Internet City', 'free_zone', 'dubai', 1750000, 850000, 1200000),
    ('Dubai Media City', 'free_zone', 'dubai', 1650000, 800000, 1100000),
    ('Dubai Design District', 'free_zone', 'dubai', 1550000, 750000, 1050000),
    ('Dubai Healthcare City', 'free_zone', 'dubai', 1900000, 950000, 1300000),
    ('Dubai Silicon Oasis', 'free_zone', 'dubai', 1450000, 700000, 850000),
    ('Dubai CommerCity', 'free_zone', 'dubai', 1600000, 820000, 950000),
    ('Dubai World Trade Centre', 'free_zone', 'dubai', 1400000, 700000, 850000),
    ('Dubai Knowledge Park', 'free_zone', 'dubai', 1500000, 750000, 1000000),
    ('Dubai International Academic City', 'free_zone', 'dubai', 1520000, 760000, 1000000),
    ('Dubai Production City', 'free_zone', 'dubai', 1350000, 680000, 820000),
    ('Dubai Studio City', 'free_zone', 'dubai', 1420000, 690000, 850000),
    ('Dubai Science Park', 'free_zone', 'dubai', 1580000, 780000, 1050000),
    ('ADGM', 'free_zone', 'abu_dhabi', 2100000, 1250000, 1600000),
    ('Masdar City Free Zone', 'free_zone', 'abu_dhabi', 1350000, 650000, 750000),
    ('KIZAD', 'free_zone', 'abu_dhabi', 1450000, 700000, 850000),
    ('twofour54', 'free_zone', 'abu_dhabi', 1500000, 720000, 900000),
    ('Abu Dhabi Airport Free Zone', 'free_zone', 'abu_dhabi', 1550000, 780000, 950000),
    ('SHAMS', 'free_zone', 'sharjah', 950000, 500000, 450000),
    ('SAIF Zone', 'free_zone', 'sharjah', 1050000, 550000, 500000),
    ('Hamriyah Free Zone', 'free_zone', 'sharjah', 1100000, 580000, 550000),
    ('SPC Free Zone', 'free_zone', 'sharjah', 990000, 520000, 460000),
    ('SRTIP', 'free_zone', 'sharjah', 1200000, 600000, 650000),
    ('Ajman Free Zone', 'free_zone', 'ajman', 900000, 450000, 400000),
    ('Ajman Media City', 'free_zone', 'ajman', 850000, 420000, 380000),
    ('RAKEZ', 'free_zone', 'ras_al_khaimah', 950000, 480000, 420000),
    ('RAK Maritime City', 'free_zone', 'ras_al_khaimah', 1050000, 520000, 500000),
    ('RAK ICC', 'offshore', 'ras_al_khaimah', 850000, 700000, 0),
    ('UAQ Free Trade Zone', 'free_zone', 'umm_al_quwain', 850000, 420000, 380000),
    ('Fujairah Free Zone', 'free_zone', 'fujairah', 950000, 480000, 450000),
    ('Creative City Fujairah', 'free_zone', 'fujairah', 900000, 460000, 420000),
    ('IFZ Fujairah', 'free_zone', 'fujairah', 920000, 470000, 430000),
    ('Jebel Ali Offshore', 'offshore', 'dubai', 950000, 800000, 0),
    ('BVI Offshore Desk', 'offshore', null, 1200000, 900000, 0),
    ('DMCC Crypto Centre', 'free_zone', 'dubai', 1800000, 900000, 1200000),
    ('Dubai Gold and Commodities Exchange', 'free_zone', 'dubai', 1700000, 850000, 1150000),
    ('Dubai Maritime City', 'free_zone', 'dubai', 1550000, 760000, 1000000),
    ('International Humanitarian City', 'free_zone', 'dubai', 1400000, 700000, 900000),
    ('Gold and Diamond Park', 'free_zone', 'dubai', 1500000, 750000, 950000),
    ('Dubai Auto Zone', 'free_zone', 'dubai', 1450000, 720000, 900000),
    ('Dubai Flower Centre', 'free_zone', 'dubai', 1300000, 650000, 800000),
    ('Dubai Airport City', 'free_zone', 'dubai', 1550000, 780000, 950000)
),
fee_seed as (
  select
    s.*,
    f.fee_type,
    f.activity_key,
    f.label,
    f.amount_minor,
    f.recurrence,
    f.min_shareholders,
    f.min_visas,
    f.timeline_min_days,
    f.timeline_max_days,
    f.required_document_keys
  from authority_seed s
  cross join lateral (
    values
      ('license', 'consulting', s.authority || ' service license', s.license_minor, 'annual', 1, 0, 7, 14, array['passport','photo']),
      ('registration', 'consulting', s.authority || ' registration', s.registration_minor, 'one_time', 1, 0, 2, 5, array['passport']),
      ('office_flexi', null, 'Flexi desk or shared office package', s.office_flexi_minor, 'annual', 1, 0, 1, 2, array['lease_agreement']),
      ('shareholder', null, 'Additional shareholder file', 50000, 'one_time', 2, 0, 0, 1, array['shareholder_resolution']),
      ('visa', null, 'Investor or employee visa allocation', 375000, 'one_time', 1, 1, 8, 12, array['medical_fitness']),
      ('addon_bank_account', null, 'Bank account assistance', 250000, 'one_time', 1, 0, 5, 10, array['business_plan']),
      ('addon_tax_registration', null, 'Corporate tax registration assistance', 150000, 'one_time', 1, 0, 2, 5, array['trade_license']),
      ('addon_document_attestation', null, 'Document attestation coordination', 200000, 'one_time', 1, 0, 3, 7, array['attested_documents'])
  ) as f(fee_type, activity_key, label, amount_minor, recurrence, min_shareholders, min_visas, timeline_min_days, timeline_max_days, required_document_keys)
  where f.amount_minor > 0
)
insert into public.cost_data (
  jurisdiction,
  authority,
  emirate,
  activity_key,
  fee_type,
  label,
  amount_minor,
  recurrence,
  min_shareholders,
  max_shareholders,
  min_visas,
  max_visas,
  timeline_min_days,
  timeline_max_days,
  required_document_keys,
  estimate_grade,
  active,
  valid_from
)
select
  jurisdiction,
  authority,
  emirate,
  activity_key,
  fee_type,
  label,
  amount_minor,
  recurrence,
  min_shareholders,
  50,
  min_visas,
  200,
  timeline_min_days,
  timeline_max_days,
  required_document_keys,
  true,
  true,
  date '2026-01-01'
from fee_seed
on conflict (jurisdiction, authority, (coalesce(emirate, '')), (coalesce(activity_key, '')), fee_type, valid_from)
do update set
  label = excluded.label,
  amount_minor = excluded.amount_minor,
  recurrence = excluded.recurrence,
  min_shareholders = excluded.min_shareholders,
  max_shareholders = excluded.max_shareholders,
  min_visas = excluded.min_visas,
  max_visas = excluded.max_visas,
  timeline_min_days = excluded.timeline_min_days,
  timeline_max_days = excluded.timeline_max_days,
  required_document_keys = excluded.required_document_keys,
  estimate_grade = excluded.estimate_grade,
  active = excluded.active,
  updated_at = now();
