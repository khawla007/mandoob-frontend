import type { CostDataRow, Jurisdiction } from './calculate';

type AuthoritySeed = {
  authority: string;
  jurisdiction: Jurisdiction;
  emirate: string | null;
  license: number;
  registration: number;
  officeFlexi: number;
};

const BASE_ACTIVITY_BY_FEE = new Set(['license', 'registration']);

const authorities: AuthoritySeed[] = [
  { authority: 'Dubai DED', jurisdiction: 'mainland', emirate: 'dubai', license: 1500000, registration: 620000, officeFlexi: 1200000 },
  { authority: 'JAFZA', jurisdiction: 'free_zone', emirate: 'dubai', license: 1650000, registration: 900000, officeFlexi: 1100000 },
  { authority: 'DMCC', jurisdiction: 'free_zone', emirate: 'dubai', license: 1250000, registration: 850000, officeFlexi: 900000 },
  { authority: 'DIFC', jurisdiction: 'free_zone', emirate: 'dubai', license: 2200000, registration: 1300000, officeFlexi: 1800000 },
  { authority: 'Dubai South', jurisdiction: 'free_zone', emirate: 'dubai', license: 1150000, registration: 650000, officeFlexi: 700000 },
  { authority: 'Meydan Free Zone', jurisdiction: 'free_zone', emirate: 'dubai', license: 1250000, registration: 550000, officeFlexi: 600000 },
  { authority: 'IFZA', jurisdiction: 'free_zone', emirate: 'dubai', license: 1290000, registration: 600000, officeFlexi: 650000 },
  { authority: 'DAFZA', jurisdiction: 'free_zone', emirate: 'dubai', license: 1800000, registration: 950000, officeFlexi: 1250000 },
  { authority: 'Dubai Internet City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1750000, registration: 850000, officeFlexi: 1200000 },
  { authority: 'Dubai Media City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1650000, registration: 800000, officeFlexi: 1100000 },
  { authority: 'Dubai Design District', jurisdiction: 'free_zone', emirate: 'dubai', license: 1550000, registration: 750000, officeFlexi: 1050000 },
  { authority: 'Dubai Healthcare City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1900000, registration: 950000, officeFlexi: 1300000 },
  { authority: 'Dubai Silicon Oasis', jurisdiction: 'free_zone', emirate: 'dubai', license: 1450000, registration: 700000, officeFlexi: 850000 },
  { authority: 'Dubai CommerCity', jurisdiction: 'free_zone', emirate: 'dubai', license: 1600000, registration: 820000, officeFlexi: 950000 },
  { authority: 'Dubai World Trade Centre', jurisdiction: 'free_zone', emirate: 'dubai', license: 1400000, registration: 700000, officeFlexi: 850000 },
  { authority: 'Dubai Knowledge Park', jurisdiction: 'free_zone', emirate: 'dubai', license: 1500000, registration: 750000, officeFlexi: 1000000 },
  { authority: 'Dubai International Academic City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1520000, registration: 760000, officeFlexi: 1000000 },
  { authority: 'Dubai Production City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1350000, registration: 680000, officeFlexi: 820000 },
  { authority: 'Dubai Studio City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1420000, registration: 690000, officeFlexi: 850000 },
  { authority: 'Dubai Science Park', jurisdiction: 'free_zone', emirate: 'dubai', license: 1580000, registration: 780000, officeFlexi: 1050000 },
  { authority: 'ADGM', jurisdiction: 'free_zone', emirate: 'abu_dhabi', license: 2100000, registration: 1250000, officeFlexi: 1600000 },
  { authority: 'Masdar City Free Zone', jurisdiction: 'free_zone', emirate: 'abu_dhabi', license: 1350000, registration: 650000, officeFlexi: 750000 },
  { authority: 'KIZAD', jurisdiction: 'free_zone', emirate: 'abu_dhabi', license: 1450000, registration: 700000, officeFlexi: 850000 },
  { authority: 'twofour54', jurisdiction: 'free_zone', emirate: 'abu_dhabi', license: 1500000, registration: 720000, officeFlexi: 900000 },
  { authority: 'Abu Dhabi Airport Free Zone', jurisdiction: 'free_zone', emirate: 'abu_dhabi', license: 1550000, registration: 780000, officeFlexi: 950000 },
  { authority: 'SHAMS', jurisdiction: 'free_zone', emirate: 'sharjah', license: 950000, registration: 500000, officeFlexi: 450000 },
  { authority: 'SAIF Zone', jurisdiction: 'free_zone', emirate: 'sharjah', license: 1050000, registration: 550000, officeFlexi: 500000 },
  { authority: 'Hamriyah Free Zone', jurisdiction: 'free_zone', emirate: 'sharjah', license: 1100000, registration: 580000, officeFlexi: 550000 },
  { authority: 'SPC Free Zone', jurisdiction: 'free_zone', emirate: 'sharjah', license: 990000, registration: 520000, officeFlexi: 460000 },
  { authority: 'SRTIP', jurisdiction: 'free_zone', emirate: 'sharjah', license: 1200000, registration: 600000, officeFlexi: 650000 },
  { authority: 'Ajman Free Zone', jurisdiction: 'free_zone', emirate: 'ajman', license: 900000, registration: 450000, officeFlexi: 400000 },
  { authority: 'Ajman Media City', jurisdiction: 'free_zone', emirate: 'ajman', license: 850000, registration: 420000, officeFlexi: 380000 },
  { authority: 'RAKEZ', jurisdiction: 'free_zone', emirate: 'ras_al_khaimah', license: 950000, registration: 480000, officeFlexi: 420000 },
  { authority: 'RAK Maritime City', jurisdiction: 'free_zone', emirate: 'ras_al_khaimah', license: 1050000, registration: 520000, officeFlexi: 500000 },
  { authority: 'RAK ICC', jurisdiction: 'offshore', emirate: 'ras_al_khaimah', license: 850000, registration: 700000, officeFlexi: 0 },
  { authority: 'UAQ Free Trade Zone', jurisdiction: 'free_zone', emirate: 'umm_al_quwain', license: 850000, registration: 420000, officeFlexi: 380000 },
  { authority: 'Fujairah Free Zone', jurisdiction: 'free_zone', emirate: 'fujairah', license: 950000, registration: 480000, officeFlexi: 450000 },
  { authority: 'Creative City Fujairah', jurisdiction: 'free_zone', emirate: 'fujairah', license: 900000, registration: 460000, officeFlexi: 420000 },
  { authority: 'IFZ Fujairah', jurisdiction: 'free_zone', emirate: 'fujairah', license: 920000, registration: 470000, officeFlexi: 430000 },
  { authority: 'Jebel Ali Offshore', jurisdiction: 'offshore', emirate: 'dubai', license: 950000, registration: 800000, officeFlexi: 0 },
  { authority: 'BVI Offshore Desk', jurisdiction: 'offshore', emirate: null, license: 1200000, registration: 900000, officeFlexi: 0 },
  { authority: 'DMCC Crypto Centre', jurisdiction: 'free_zone', emirate: 'dubai', license: 1800000, registration: 900000, officeFlexi: 1200000 },
  { authority: 'Dubai Gold and Commodities Exchange', jurisdiction: 'free_zone', emirate: 'dubai', license: 1700000, registration: 850000, officeFlexi: 1150000 },
  { authority: 'Dubai Maritime City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1550000, registration: 760000, officeFlexi: 1000000 },
  { authority: 'International Humanitarian City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1400000, registration: 700000, officeFlexi: 900000 },
  { authority: 'Gold and Diamond Park', jurisdiction: 'free_zone', emirate: 'dubai', license: 1500000, registration: 750000, officeFlexi: 950000 },
  { authority: 'Dubai Auto Zone', jurisdiction: 'free_zone', emirate: 'dubai', license: 1450000, registration: 720000, officeFlexi: 900000 },
  { authority: 'Dubai Flower Centre', jurisdiction: 'free_zone', emirate: 'dubai', license: 1300000, registration: 650000, officeFlexi: 800000 },
  { authority: 'Dubai Airport City', jurisdiction: 'free_zone', emirate: 'dubai', license: 1550000, registration: 780000, officeFlexi: 950000 },
];

export const seededCostDataRows: CostDataRow[] = authorities.flatMap((seed) => {
  const common = {
    jurisdiction: seed.jurisdiction,
    authority: seed.authority,
    emirate: seed.emirate,
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  } satisfies Partial<CostDataRow>;

  return [
    row(seed, common, 'license', `${seed.authority} service license`, seed.license, 'annual', 7, 14, ['passport', 'photo']),
    row(seed, common, 'registration', `${seed.authority} registration`, seed.registration, 'one_time', 2, 5, ['passport']),
    ...(seed.officeFlexi > 0
      ? [row(seed, common, 'office_flexi', 'Flexi desk or shared office package', seed.officeFlexi, 'annual', 1, 2, ['lease_agreement'])]
      : []),
    row(seed, common, 'shareholder', 'Additional shareholder file', 50000, 'one_time', 0, 1, ['shareholder_resolution']),
    row(seed, common, 'visa', 'Investor or employee visa allocation', 375000, 'one_time', 8, 12, ['medical_fitness']),
    row(seed, common, 'addon_bank_account', 'Bank account assistance', 250000, 'one_time', 5, 10, ['business_plan']),
    row(seed, common, 'addon_tax_registration', 'Corporate tax registration assistance', 150000, 'one_time', 2, 5, ['trade_license']),
    row(seed, common, 'addon_document_attestation', 'Document attestation coordination', 200000, 'one_time', 3, 7, ['attested_documents']),
  ];
});

function row(
  seed: AuthoritySeed,
  common: Partial<CostDataRow>,
  feeType: string,
  label: string,
  amountMinor: number,
  recurrence: CostDataRow['recurrence'],
  timelineMinDays: number,
  timelineMaxDays: number,
  requiredDocumentKeys: string[],
): CostDataRow {
  return {
    ...(common as Omit<CostDataRow, 'id' | 'activityKey' | 'feeType' | 'label' | 'amountMinor' | 'recurrence' | 'timelineMinDays' | 'timelineMaxDays' | 'requiredDocumentKeys'>),
    id: `${seed.authority.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${feeType}`,
    activityKey: BASE_ACTIVITY_BY_FEE.has(feeType) ? 'consulting' : null,
    feeType,
    label,
    amountMinor,
    recurrence,
    timelineMinDays,
    timelineMaxDays,
    requiredDocumentKeys,
  };
}
