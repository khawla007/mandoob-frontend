import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildApplyNowUrl,
  calculateEstimate,
  validateEstimateInput,
  type CostDataRow,
  type EstimateInput,
} from './calculate';

const rows: CostDataRow[] = [
  {
    id: 'license',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: 'consulting',
    feeType: 'license',
    label: 'DMCC service license',
    amountMinor: 1250000,
    recurrence: 'annual',
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    timelineMinDays: 7,
    timelineMaxDays: 14,
    requiredDocumentKeys: ['passport', 'photo'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
  {
    id: 'registration',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: 'consulting',
    feeType: 'registration',
    label: 'Registration and name reservation',
    amountMinor: 850000,
    recurrence: 'one_time',
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    timelineMinDays: 2,
    timelineMaxDays: 5,
    requiredDocumentKeys: ['passport'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
  {
    id: 'office',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: null,
    feeType: 'office_flexi',
    label: 'Flexi desk',
    amountMinor: 900000,
    recurrence: 'annual',
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    timelineMinDays: 1,
    timelineMaxDays: 2,
    requiredDocumentKeys: ['lease_agreement'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
  {
    id: 'shareholder',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: null,
    feeType: 'shareholder',
    label: 'Additional shareholder file',
    amountMinor: 50000,
    recurrence: 'one_time',
    minShareholders: 2,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    timelineMinDays: 0,
    timelineMaxDays: 1,
    requiredDocumentKeys: ['shareholder_resolution'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
  {
    id: 'visa',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: null,
    feeType: 'visa',
    label: 'Investor visa allocation',
    amountMinor: 375000,
    recurrence: 'one_time',
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 1,
    maxVisas: 200,
    timelineMinDays: 8,
    timelineMaxDays: 12,
    requiredDocumentKeys: ['medical_fitness'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
  {
    id: 'bank',
    jurisdiction: 'free_zone',
    authority: 'DMCC',
    emirate: 'dubai',
    activityKey: null,
    feeType: 'addon_bank_account',
    label: 'Bank account assistance',
    amountMinor: 250000,
    recurrence: 'one_time',
    minShareholders: 1,
    maxShareholders: 50,
    minVisas: 0,
    maxVisas: 200,
    timelineMinDays: 5,
    timelineMaxDays: 10,
    requiredDocumentKeys: ['business_plan'],
    active: true,
    validFrom: '2026-01-01',
    validTo: null,
    estimateGrade: true,
  },
];

const input: EstimateInput = {
  jurisdiction: 'free_zone',
  authority: 'DMCC',
  emirate: 'dubai',
  activityKey: 'consulting',
  shareholderCount: 3,
  visaCount: 2,
  legalStructure: 'fz_llc',
  officeType: 'flexi',
  addOns: ['bank_account'],
};

test('calculateEstimate totals base, office, shareholders, visas, and add-ons from rows', () => {
  const estimate = calculateEstimate(input, rows);

  assert.equal(estimate.oneTimeTotalMinor, 1950000);
  assert.equal(estimate.annualTotalMinor, 2150000);
  assert.deepEqual(
    estimate.lineItems.map((item) => [item.feeType, item.quantity, item.totalMinor]),
    [
      ['license', 1, 1250000],
      ['registration', 1, 850000],
      ['office_flexi', 1, 900000],
      ['shareholder', 2, 100000],
      ['visa', 2, 750000],
      ['addon_bank_account', 1, 250000],
    ],
  );
  assert.deepEqual(estimate.timelineDays, { min: 23, max: 44 });
  assert.deepEqual(estimate.requiredDocumentKeys.sort(), [
    'business_plan',
    'lease_agreement',
    'medical_fitness',
    'passport',
    'photo',
    'shareholder_resolution',
  ]);
  assert.match(estimate.reference, /^EST-[A-Z0-9]{10}$/);
});

test('validateEstimateInput rejects invalid bounds and unsupported choices', () => {
  assert.throws(
    () => validateEstimateInput({ ...input, shareholderCount: 0 }),
    /Shareholder count must be between 1 and 50/,
  );
  assert.throws(() => validateEstimateInput({ ...input, visaCount: 201 }), /Visa count must be between 0 and 200/);
  assert.throws(() => validateEstimateInput({ ...input, officeType: 'garage' as never }), /Unsupported office type/);
  assert.throws(
    () => validateEstimateInput({ ...input, jurisdiction: 'mainland', legalStructure: 'offshore_company' }),
    /Legal structure is not supported/,
  );
});

test('buildApplyNowUrl preserves Step 25 handoff state', () => {
  const estimate = calculateEstimate(input, rows);
  const url = buildApplyNowUrl(input, estimate);

  assert.equal(url.pathname, '/apply');
  assert.equal(url.searchParams.get('estimate_ref'), estimate.reference);
  assert.equal(url.searchParams.get('jurisdiction'), 'free_zone');
  assert.equal(url.searchParams.get('authority'), 'DMCC');
  assert.equal(url.searchParams.get('shareholders'), '3');
  assert.equal(url.searchParams.get('visas'), '2');
  assert.equal(url.searchParams.get('addons'), 'bank_account');
});
