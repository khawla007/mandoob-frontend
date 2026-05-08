import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getVisibleQuestionnaireFields,
  normalizeEstimatorHandoff,
  questionnaireSubmissionSchema,
  type QuestionnaireAnswers,
} from './index';

const validAnswers: QuestionnaireAnswers = {
  source: 'questionnaire',
  fullName: 'Aisha Khan',
  email: 'aisha@example.com',
  phone: '+971501234567',
  nationality: 'India',
  activity: 'consulting',
  preferredNames: ['Aisha Consulting FZE', 'Aisha Advisory FZE', 'Aisha Services FZE'],
  businessSummary: 'Business setup and management consulting.',
  jurisdiction: 'free_zone',
  authority: 'DMCC',
  shareholderCount: 2,
  shareholderSplitSummary: 'Aisha 60%, Omar 40%',
  investorVisaCount: 1,
  employeeVisaCount: 2,
  familyVisaCount: 0,
  officeType: 'flexi',
  officeAreaNotes: 'Desk package is enough for year one.',
  addOns: ['bank_account', 'tax_registration'],
  documentReadiness: 'partial',
  notes: 'Need follow-up this week.',
};

test('questionnaire validation requires conditional shareholder split when shareholder count is above one', () => {
  const parsed = questionnaireSubmissionSchema.safeParse({
    answers: {
      ...validAnswers,
      shareholderSplitSummary: '',
    },
    estimateData: null,
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.ok(parsed.error.issues.some((issue) => issue.path.join('.') === 'answers.shareholderSplitSummary'));
  }
});

test('questionnaire validation accepts complete answers and normalizes contact fields', () => {
  const parsed = questionnaireSubmissionSchema.parse({
    answers: {
      ...validAnswers,
      fullName: '  Aisha Khan  ',
      email: 'AISHA@EXAMPLE.COM',
      phone: '  +971501234567  ',
    },
    estimateData: { reference: 'EST-ABC1234567' },
  });

  assert.equal(parsed.answers.fullName, 'Aisha Khan');
  assert.equal(parsed.answers.email, 'aisha@example.com');
  assert.equal(parsed.answers.phone, '+971501234567');
  assert.equal(parsed.answers.source, 'questionnaire');
});

test('conditional visibility hides optional detail fields until their triggers apply', () => {
  const visible = getVisibleQuestionnaireFields({
    ...validAnswers,
    shareholderCount: 1,
    investorVisaCount: 0,
    employeeVisaCount: 0,
    familyVisaCount: 0,
    officeType: 'none',
  });

  assert.equal(visible.includes('shareholderSplitSummary'), false);
  assert.equal(visible.includes('officeAreaNotes'), false);
  assert.equal(visible.includes('investorVisaCount'), false);
  assert.equal(visible.includes('employeeVisaCount'), false);
});

test('estimator handoff query params prefill answers and preserve estimate context', () => {
  const normalized = normalizeEstimatorHandoff(
    new URLSearchParams(
      'estimate_ref=EST-1234567890&jurisdiction=free_zone&authority=DMCC&activity=consulting&shareholders=3&visas=2&legal_structure=fz_llc&office_type=flexi&addons=bank_account,tax_registration',
    ),
  );

  assert.equal(normalized.answers.jurisdiction, 'free_zone');
  assert.equal(normalized.answers.authority, 'DMCC');
  assert.equal(normalized.answers.activity, 'consulting');
  assert.equal(normalized.answers.shareholderCount, 3);
  assert.equal(normalized.answers.investorVisaCount, 1);
  assert.equal(normalized.answers.employeeVisaCount, 1);
  assert.deepEqual(normalized.answers.addOns, ['bank_account', 'tax_registration']);
  assert.equal(normalized.estimateData.reference, 'EST-1234567890');
  assert.equal(normalized.estimateData.legalStructure, 'fz_llc');
});

test('questionnaire validation rejects arbitrary estimate data keys', () => {
  const parsed = questionnaireSubmissionSchema.safeParse({
    answers: validAnswers,
    estimateData: {
      reference: 'EST-1234567890',
      injected: '<script>alert(1)</script>',
    },
  });

  assert.equal(parsed.success, false);
});
