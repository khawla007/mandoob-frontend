import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreLead, scoreTemperatureFromScore } from './scoring';

const baseAnswers = {
  fullName: 'Aisha Khan',
  email: 'aisha@example.com',
  phone: '+971501234567',
  businessSummary: 'Business setup and management consulting.',
  preferredNames: ['Aisha Consulting FZE', 'Aisha Advisory FZE', 'Aisha Services FZE'],
  jurisdiction: 'free_zone',
  authority: 'DMCC',
  investorVisaCount: 0,
  employeeVisaCount: 0,
  familyVisaCount: 0,
  addOns: [],
  documentReadiness: 'partial',
  notes: null,
};

test('scoreLead marks high-intent mainland leads as hot with readable factors', () => {
  const result = scoreLead({
    answers: {
      ...baseAnswers,
      jurisdiction: 'mainland',
      investorVisaCount: 2,
      employeeVisaCount: 4,
      familyVisaCount: 2,
      addOns: ['bank_account', 'tax_registration', 'document_attestation', 'pro_services'],
      documentReadiness: 'ready',
      notes: 'Need license and visas this month.',
    },
    estimateData: { reference: 'EST-1234567890', totalAed: 45000 },
  });

  assert.equal(result.score, 100);
  assert.equal(result.temperature, 'hot');
  assert.ok(result.factors.some((factor) => factor.key === 'visa_demand' && factor.points === 25));
  assert.ok(result.factors.every((factor) => factor.label && Number.isFinite(factor.points)));
});

test('scoreLead marks partial free-zone enquiries as warm', () => {
  const result = scoreLead({
    answers: {
      ...baseAnswers,
      addOns: ['bank_account'],
      documentReadiness: 'partial',
    },
    estimateData: { reference: 'EST-1234567890' },
  });

  assert.equal(result.temperature, 'warm');
  assert.ok(result.score >= 45 && result.score <= 74);
});

test('scoreLead handles sparse offshore leads as cold', () => {
  const result = scoreLead({
    answers: {
      fullName: 'Sparse Lead',
      email: null,
      phone: '+971501234567',
      jurisdiction: 'offshore',
      investorVisaCount: 0,
      employeeVisaCount: 0,
      familyVisaCount: 0,
      addOns: [],
      documentReadiness: 'not_ready',
    },
    estimateData: null,
  });

  assert.equal(result.temperature, 'cold');
  assert.ok(result.score <= 44);
});

test('scoreLead clamps very large visa and add-on signals to 100', () => {
  const result = scoreLead({
    answers: {
      ...baseAnswers,
      jurisdiction: 'mainland',
      investorVisaCount: 200,
      employeeVisaCount: 200,
      familyVisaCount: 200,
      addOns: ['bank_account', 'tax_registration', 'document_attestation', 'pro_services'],
      documentReadiness: 'ready',
      notes: 'Long enough notes to count toward completeness.',
    },
    estimateData: { reference: 'EST-1234567890' },
  });

  assert.equal(result.score, 100);
});

test('scoreLead tolerates missing optional fields', () => {
  const result = scoreLead({ answers: {}, estimateData: {} });

  assert.equal(result.score, 10);
  assert.equal(result.temperature, 'cold');
  assert.deepEqual(scoreTemperatureFromScore(75), 'hot');
});
