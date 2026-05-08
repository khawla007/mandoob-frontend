import assert from 'node:assert/strict';
import test from 'node:test';
import {
  costDataRowsToCsv,
  createCostDataSchema,
  formatMinorAsAed,
  parseAedToMinor,
  parseCostDataCsv,
} from './cost-data';

const validInput = {
  jurisdiction: 'free_zone',
  authority: 'DMCC',
  emirate: 'dubai',
  activityKey: 'general_trading',
  feeType: 'license',
  label: 'License package',
  amount: '1250.50',
  currency: 'AED',
  recurrence: 'one_time',
  minShareholders: 1,
  maxShareholders: 50,
  minVisas: 0,
  maxVisas: 200,
  timelineMinDays: 3,
  timelineMaxDays: 10,
  requiredDocumentKeys: 'passport, trade_name',
  estimateGrade: true,
  active: true,
  validFrom: '2026-01-01',
  validTo: '',
};

test('parseAedToMinor converts AED strings to minor units', () => {
  assert.equal(parseAedToMinor('1250.50'), 125050);
  assert.equal(parseAedToMinor('1250'), 125000);
  assert.equal(formatMinorAsAed(125050), '1250.50');
});

test('createCostDataSchema normalizes optional fields and document keys', () => {
  const parsed = createCostDataSchema.parse(validInput);
  assert.equal(parsed.amount, 125050);
  assert.equal(parsed.validTo, null);
  assert.deepEqual(parsed.requiredDocumentKeys, ['passport', 'trade_name']);
});

test('createCostDataSchema preserves false boolean strings', () => {
  const parsed = createCostDataSchema.parse({ ...validInput, estimateGrade: 'false', active: 'false' });
  assert.equal(parsed.estimateGrade, false);
  assert.equal(parsed.active, false);
});

test('createCostDataSchema rejects inverted ranges', () => {
  const parsed = createCostDataSchema.safeParse({ ...validInput, minVisas: 5, maxVisas: 2 });
  assert.equal(parsed.success, false);
});

test('createCostDataSchema rejects invalid validity windows', () => {
  const parsed = createCostDataSchema.safeParse({ ...validInput, validTo: '2025-12-31' });
  assert.equal(parsed.success, false);
});

test('parseCostDataCsv reports row-numbered validation errors', () => {
  const result = parseCostDataCsv(
    [
      'jurisdiction,authority,fee_type,label,amount_aed,currency,recurrence,min_shareholders,max_shareholders,min_visas,max_visas,timeline_min_days,timeline_max_days,valid_from',
      'free_zone,DMCC,license,License,1250.00,AED,one_time,1,50,10,2,1,3,2026-01-01',
    ].join('\n'),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[0], /Row 2/);
});

test('costDataRowsToCsv exports escaped AED rows', () => {
  const csv = costDataRowsToCsv([
    {
      id: '00000000-0000-0000-0000-000000000001',
      jurisdiction: 'free_zone',
      authority: 'DMCC',
      emirate: 'dubai',
      activityKey: 'general_trading',
      feeType: 'license',
      label: 'License, package',
      amountMinor: 125050,
      currency: 'AED',
      recurrence: 'one_time',
      minShareholders: 1,
      maxShareholders: 50,
      minVisas: 0,
      maxVisas: 200,
      timelineMinDays: 3,
      timelineMaxDays: 10,
      requiredDocumentKeys: ['passport', 'trade_name'],
      estimateGrade: true,
      active: true,
      validFrom: '2026-01-01',
      validTo: null,
    },
  ]);
  assert.match(csv, /amount_aed/);
  assert.match(csv, /1250.50/);
  assert.match(csv, /"License, package"/);
  assert.match(csv, /passport\|trade_name/);
});
