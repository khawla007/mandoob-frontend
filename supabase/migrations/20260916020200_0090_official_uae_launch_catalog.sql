-- P3.04 — product-owner-approved UAE launch catalog, reviewed 2026-09-16.
--
-- This is a deliberately bounded launch catalog, not a claim of exhaustive UAE coverage.
-- Authority identities, licence categories and prices come only from the official URLs stored
-- below and in the P3.04 source matrix. Package offers can change; the version/effective-date
-- boundary makes a later review a new immutable catalog version. Unpublished legacy estimator
-- seeds remain disabled and are not copied into this catalog.

insert into public.catalog_sources (
  id, code, name, source_owner, source_url, approved_at
) values (
  '90400000-0000-4000-8000-000000000001',
  'official-uae-launch-catalog',
  'Official UAE and licensing-authority launch catalog',
  'UAE Government and named UAE licensing authorities',
  'https://u.ae/en/information-and-services/business/doing-business-in-free-zones',
  timestamptz '2026-09-16 00:00:00+00'
);

insert into public.catalog_versions (
  id, source_id, version_key, version_number, status, effective_from,
  approved_at, published_at
) values (
  '90400000-0000-4000-8000-000000000002',
  '90400000-0000-4000-8000-000000000001',
  'official-web-review-2026-09-16',
  1,
  'published',
  date '2026-09-16',
  timestamptz '2026-09-16 00:00:00+00',
  timestamptz '2026-09-16 00:00:00+00'
);

insert into public.catalog_authorities (
  id, catalog_version_id, slug, name, jurisdiction, emirate, summary,
  official_url, availability, sort_order
) values
  (
    '90400000-0000-4000-8000-000000000101',
    '90400000-0000-4000-8000-000000000002',
    'dmcc', 'DMCC', 'free_zone', 'dubai',
    'Official Dubai Multi Commodities Centre launch record; activity eligibility and current terms require authority confirmation.',
    'https://dmcc.ae/business/business-setup-packages', 'available', 10
  ),
  (
    '90400000-0000-4000-8000-000000000102',
    '90400000-0000-4000-8000-000000000002',
    'jafza', 'JAFZA', 'free_zone', 'dubai',
    'Official Jebel Ali Free Zone launch record; activity eligibility and facility requirements require authority confirmation.',
    'https://www.jafza.ae/resource-centre/guides/new-company-formation/', 'available', 20
  ),
  (
    '90400000-0000-4000-8000-000000000103',
    '90400000-0000-4000-8000-000000000002',
    'ifza', 'IFZA', 'free_zone', 'dubai',
    'Official IFZA Dubai launch record; proposals are tailored to the selected licence, activities, visas and office solution.',
    'https://ifza.com/en/guide/uae-business-activity-license-mapping-guide/', 'available', 30
  ),
  (
    '90400000-0000-4000-8000-000000000104',
    '90400000-0000-4000-8000-000000000002',
    'rakez', 'RAKEZ', 'free_zone', 'ras_al_khaimah',
    'Official Ras Al Khaimah Economic Zone launch record; package suitability depends on selected activities and approvals.',
    'https://rakez.com/en/promotions/sme-business-setup', 'available', 40
  ),
  (
    '90400000-0000-4000-8000-000000000105',
    '90400000-0000-4000-8000-000000000002',
    'shams', 'SHAMS', 'free_zone', 'sharjah',
    'Official Sharjah Media City launch record; current offer terms and activity approval require authority confirmation.',
    'https://startwith.shams.ae/start-with-shams/', 'available', 50
  ),
  (
    '90400000-0000-4000-8000-000000000106',
    '90400000-0000-4000-8000-000000000002',
    'meydan-free-zone', 'Meydan Free Zone', 'free_zone', 'dubai',
    'Official Meydan Free Zone launch record; pricing starts from the published standard package and varies by selections.',
    'https://www.meydanfz.ae/', 'available', 60
  ),
  (
    '90400000-0000-4000-8000-000000000107',
    '90400000-0000-4000-8000-000000000002',
    'rak-icc', 'RAK ICC', 'offshore', 'ras_al_khaimah',
    'Official RAK International Corporate Centre record; incorporation is completed through a registered agent.',
    'https://www.rakicc.com/company-formation-page/company-formation/', 'available', 70
  ),
  (
    '90400000-0000-4000-8000-000000000108',
    '90400000-0000-4000-8000-000000000002',
    'jebel-ali-offshore', 'Jebel Ali Offshore', 'offshore', 'dubai',
    'Official JAFZA offshore-company record; registration must be processed through a JAFZA registered agent.',
    'https://www.jafza.ae/resource-centre/guides/new-offshore-company/', 'available', 80
  );

insert into public.catalog_activities (
  id, catalog_version_id, slug, name, category, availability, sort_order
) values
  ('90400000-0000-4000-8000-000000000201', '90400000-0000-4000-8000-000000000002', 'trading', 'Trading', 'commercial', 'available', 10),
  ('90400000-0000-4000-8000-000000000202', '90400000-0000-4000-8000-000000000002', 'professional-services', 'Professional services', 'professional', 'available', 20),
  ('90400000-0000-4000-8000-000000000203', '90400000-0000-4000-8000-000000000002', 'industrial', 'Industrial', 'industrial', 'available', 30),
  ('90400000-0000-4000-8000-000000000204', '90400000-0000-4000-8000-000000000002', 'e-commerce', 'E-commerce', 'commercial', 'available', 40),
  ('90400000-0000-4000-8000-000000000205', '90400000-0000-4000-8000-000000000002', 'media', 'Media', 'professional', 'available', 50),
  ('90400000-0000-4000-8000-000000000206', '90400000-0000-4000-8000-000000000002', 'holding-company', 'Holding company', 'holding', 'available', 60);

insert into public.catalog_licence_types (
  id, catalog_version_id, slug, name, description, availability, sort_order
) values
  ('90400000-0000-4000-8000-000000000301', '90400000-0000-4000-8000-000000000002', 'commercial', 'Commercial licence', 'For approved commercial or trading activities.', 'available', 10),
  ('90400000-0000-4000-8000-000000000302', '90400000-0000-4000-8000-000000000002', 'professional', 'Professional or service licence', 'For approved professional or service activities.', 'available', 20),
  ('90400000-0000-4000-8000-000000000303', '90400000-0000-4000-8000-000000000002', 'industrial', 'Industrial licence', 'For approved manufacturing or industrial activities.', 'available', 30),
  ('90400000-0000-4000-8000-000000000304', '90400000-0000-4000-8000-000000000002', 'e-commerce', 'E-commerce licence', 'For approved online trading or service activities.', 'available', 40),
  ('90400000-0000-4000-8000-000000000305', '90400000-0000-4000-8000-000000000002', 'media', 'Media licence', 'For approved media activities.', 'available', 50),
  ('90400000-0000-4000-8000-000000000306', '90400000-0000-4000-8000-000000000002', 'offshore-company', 'Offshore company registration', 'For an approved offshore company structure through the relevant authority or registered agent.', 'available', 60);

-- These rows are discovery mappings, not automatic approvals. The chosen authority must confirm
-- the exact activity, licence, legal form, premises and any external regulator approval.
insert into public.catalog_authority_activities (
  id, catalog_version_id, authority_id, activity_id, licence_type_id,
  eligibility_state, eligibility_note, sort_order
) values
  ('90400000-0000-4000-8000-000000000601', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000101', '90400000-0000-4000-8000-000000000201', '90400000-0000-4000-8000-000000000301', 'approval_required', 'Confirm the exact activity and package with DMCC.', 10),
  ('90400000-0000-4000-8000-000000000602', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000102', '90400000-0000-4000-8000-000000000201', '90400000-0000-4000-8000-000000000301', 'approval_required', 'Confirm the activity group and facility requirements with JAFZA.', 20),
  ('90400000-0000-4000-8000-000000000603', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000102', '90400000-0000-4000-8000-000000000203', '90400000-0000-4000-8000-000000000303', 'approval_required', 'Confirm the activity group and facility requirements with JAFZA.', 21),
  ('90400000-0000-4000-8000-000000000604', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000103', '90400000-0000-4000-8000-000000000201', '90400000-0000-4000-8000-000000000301', 'approval_required', 'Confirm the current IFZA activity code and proposal.', 30),
  ('90400000-0000-4000-8000-000000000605', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000103', '90400000-0000-4000-8000-000000000202', '90400000-0000-4000-8000-000000000302', 'approval_required', 'Confirm the current IFZA activity code and proposal.', 31),
  ('90400000-0000-4000-8000-000000000606', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000104', '90400000-0000-4000-8000-000000000204', '90400000-0000-4000-8000-000000000304', 'approval_required', 'Confirm the selected activities and package with RAKEZ.', 40),
  ('90400000-0000-4000-8000-000000000607', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000104', '90400000-0000-4000-8000-000000000205', '90400000-0000-4000-8000-000000000305', 'approval_required', 'Confirm the selected activities and package with RAKEZ.', 41),
  ('90400000-0000-4000-8000-000000000608', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000105', '90400000-0000-4000-8000-000000000205', '90400000-0000-4000-8000-000000000305', 'approval_required', 'Confirm the current Shams activity and offer terms.', 50),
  ('90400000-0000-4000-8000-000000000609', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000106', '90400000-0000-4000-8000-000000000201', '90400000-0000-4000-8000-000000000301', 'approval_required', 'Confirm the selected activity groups and package with Meydan Free Zone.', 60),
  ('90400000-0000-4000-8000-000000000610', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000107', '90400000-0000-4000-8000-000000000206', '90400000-0000-4000-8000-000000000306', 'approval_required', 'A RAK ICC registered agent must confirm structure suitability and requirements.', 70),
  ('90400000-0000-4000-8000-000000000611', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000108', '90400000-0000-4000-8000-000000000206', '90400000-0000-4000-8000-000000000306', 'approval_required', 'A JAFZA registered agent must process the offshore registration.', 80);

insert into public.catalog_packages (
  id, catalog_version_id, authority_id, licence_type_id, slug, name,
  summary, availability, sort_order
) values
  ('90400000-0000-4000-8000-000000000401', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000101', '90400000-0000-4000-8000-000000000302', 'dmcc-basic-biz', 'DMCC Basic Biz Package', 'Official published package for eligible individual shareholders; terms and conditions apply.', 'available', 10),
  ('90400000-0000-4000-8000-000000000402', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000102', '90400000-0000-4000-8000-000000000301', 'jafza-trading-one-group', 'JAFZA Trading Licence — one group', 'Official published licence fee for one trading activity group.', 'available', 20),
  ('90400000-0000-4000-8000-000000000403', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000103', '90400000-0000-4000-8000-000000000301', 'ifza-tailored-proposal', 'IFZA tailored proposal', 'Price depends on the approved activity, licence, visa and office selections.', 'available', 30),
  ('90400000-0000-4000-8000-000000000404', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000104', '90400000-0000-4000-8000-000000000301', 'rakez-all-inclusive', 'RAKEZ all-inclusive business setup', 'Official published annual package; selected activities and authority terms apply.', 'available', 40),
  ('90400000-0000-4000-8000-000000000405', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000105', '90400000-0000-4000-8000-000000000305', 'shams-media-zero-visa', 'Shams Media Package — zero visa', 'Official published zero-visa media package; offer terms and conditions apply.', 'available', 50),
  ('90400000-0000-4000-8000-000000000406', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000106', '90400000-0000-4000-8000-000000000301', 'meydan-standard-digital', 'Meydan standard digital trade licence', 'Official published starting package with flexi-desk and up to three activity groups.', 'available', 60),
  ('90400000-0000-4000-8000-000000000407', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000107', '90400000-0000-4000-8000-000000000306', 'rak-icc-registered-agent-quote', 'RAK ICC registered-agent quotation', 'Registration is completed through a registered agent; obtain a current case-specific quotation.', 'available', 70),
  ('90400000-0000-4000-8000-000000000408', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000108', '90400000-0000-4000-8000-000000000306', 'jebel-ali-offshore-registration', 'Jebel Ali Offshore registration', 'Official published registration fee; registered-agent and other applicable charges are separate.', 'available', 80);

insert into public.catalog_package_prices (
  id, catalog_version_id, package_id, price_state, amount_minor, currency,
  recurrence, inclusions, exclusions, effective_from, sort_order
) values
  ('90400000-0000-4000-8000-000000000501', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000401', 'priced', 3548400, 'AED', 'one_time', array['DMCC company licence', 'Special flexi-desk option', 'Complimentary true copy of resolution'], array['Authority terms and optional services not stated as included'], date '2026-09-16', 10),
  ('90400000-0000-4000-8000-000000000502', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000402', 'priced', 500000, 'AED', 'annual', array['Trading licence', 'One activity group', 'Up to seven activities'], array['Facility', 'Registration and external approval charges'], date '2026-09-16', 20),
  ('90400000-0000-4000-8000-000000000503', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000403', 'on_request', null, 'AED', 'one_time', array[]::text[], array['Licence, visa and office selections require a current proposal'], date '2026-09-16', 30),
  ('90400000-0000-4000-8000-000000000504', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000404', 'priced', 1400000, 'AED', 'annual', array['Trade licence', 'One UAE residence visa', 'Coworking access'], array['Additional visas and optional premium upgrade'], date '2026-09-16', 40),
  ('90400000-0000-4000-8000-000000000505', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000405', 'priced', 575000, 'AED', 'one_time', array['Zero-visa multiple-shareholder media package'], array['Visa allocation and optional services'], date '2026-09-16', 50),
  ('90400000-0000-4000-8000-000000000506', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000406', 'priced', 1250000, 'AED', 'annual', array['Standard digital trade licence', 'Flexi-desk', 'Up to three activity groups'], array['Visas', 'Bank-account assistance and other optional services'], date '2026-09-16', 60),
  ('90400000-0000-4000-8000-000000000507', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000407', 'on_request', null, 'AED', 'one_time', array[]::text[], array['Registered-agent and case-specific charges require a current quotation'], date '2026-09-16', 70),
  ('90400000-0000-4000-8000-000000000508', '90400000-0000-4000-8000-000000000002', '90400000-0000-4000-8000-000000000408', 'priced', 1000000, 'AED', 'one_time', array['JAFZA offshore registration'], array['Registered-agent charge', 'Specimen signatures', 'Courier and case-specific charges'], date '2026-09-16', 80);

-- Only standalone official fees with an unambiguous cost-data meaning are published here.
-- Package totals stay in catalog_package_prices and are not decomposed into invented estimator rows.
insert into public.cost_data (
  id, jurisdiction, authority, emirate, activity_key, fee_type, label,
  amount_minor, currency, recurrence, min_shareholders, max_shareholders,
  min_visas, max_visas, timeline_min_days, timeline_max_days,
  required_document_keys, estimate_grade, active, valid_from, valid_to,
  source_id, catalog_version_id, catalog_authority_id
) values
  (
    '90400000-0000-4000-8000-000000000701', 'free_zone', 'JAFZA', 'dubai',
    'trading', 'license', 'JAFZA Trading Licence — one activity group',
    500000, 'AED', 'annual', 1, 50, 0, 200, 0, 0,
    array[]::text[], false, true, date '2026-09-16', null,
    '90400000-0000-4000-8000-000000000001',
    '90400000-0000-4000-8000-000000000002',
    '90400000-0000-4000-8000-000000000102'
  ),
  (
    '90400000-0000-4000-8000-000000000702', 'offshore', 'Jebel Ali Offshore', 'dubai',
    'holding-company', 'registration', 'Jebel Ali Offshore registration',
    1000000, 'AED', 'one_time', 1, 50, 0, 0, 5, 7,
    array[]::text[], false, true, date '2026-09-16', null,
    '90400000-0000-4000-8000-000000000001',
    '90400000-0000-4000-8000-000000000002',
    '90400000-0000-4000-8000-000000000108'
  );
