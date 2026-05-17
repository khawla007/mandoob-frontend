import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQuestionnaireSubmission, createQuestionnaireDefaults } from './payload';

test('createQuestionnaireDefaults merges estimator handoff with questionnaire defaults', () => {
  const answers = createQuestionnaireDefaults({
    jurisdiction: 'mainland',
    authority: 'Dubai Economy',
    activity: 'consulting',
    shareholderCount: 2,
    investorVisaCount: 1,
    employeeVisaCount: 2,
    officeType: 'physical',
    addOns: ['bank_account'],
  });

  assert.equal(answers.jurisdiction, 'mainland');
  assert.equal(answers.authority, 'Dubai Economy');
  assert.equal(answers.activity, 'consulting');
  assert.equal(answers.shareholderCount, 2);
  assert.equal(answers.investorVisaCount, 1);
  assert.equal(answers.employeeVisaCount, 2);
  assert.equal(answers.officeType, 'physical');
  assert.deepEqual(answers.addOns, ['bank_account']);
  assert.equal(answers.fullName, '');
  assert.deepEqual(answers.preferredNames, ['', '', '']);
});

test('buildQuestionnaireSubmission returns field errors for conditional requirements', () => {
  const result = buildQuestionnaireSubmission(
    {
      ...createQuestionnaireDefaults(),
      fullName: 'Aisha Khan',
      email: 'aisha@example.com',
      nationality: 'India',
      activity: 'consulting',
      preferredNames: ['Aisha Consulting FZE', 'Aisha Advisory FZE', 'Aisha Services FZE'],
      businessSummary: 'Business setup and management consulting.',
      authority: 'DMCC',
      shareholderCount: 2,
      officeType: 'physical',
      officeAreaNotes: '',
    },
    { reference: 'EST-123' },
  );

  assert.equal(result.ok, false);
  assert.equal(result.fieldErrors.shareholderSplitSummary, 'Shareholder split summary is required for multiple shareholders');
  assert.equal(result.fieldErrors.officeAreaNotes, 'Office area notes are required when office space is requested');
});

test('buildQuestionnaireSubmission trims preferred names and preserves estimate data', () => {
  const result = buildQuestionnaireSubmission(
    {
      ...createQuestionnaireDefaults(),
      fullName: 'Aisha Khan',
      email: '',
      phone: '+971501234567',
      nationality: 'India',
      activity: 'consulting',
      preferredNames: [' Aisha Consulting FZE ', ' Aisha Advisory ', 'Aisha Services'],
      businessSummary: 'Business setup and management consulting.',
      authority: 'DMCC',
    },
    { reference: 'EST-1234567890' },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.submission.answers.preferredNames, ['Aisha Consulting FZE', 'Aisha Advisory', 'Aisha Services']);
  assert.equal(result.submission.answers.email, null);
  assert.deepEqual(result.submission.estimateData, { reference: 'EST-1234567890' });
});

test('buildQuestionnaireSubmission requires three preferred names', () => {
  const result = buildQuestionnaireSubmission(
    {
      ...createQuestionnaireDefaults(),
      fullName: 'Aisha Khan',
      phone: '+971501234567',
      nationality: 'India',
      activity: 'consulting',
      preferredNames: ['Aisha Consulting FZE', '', ''],
      businessSummary: 'Business setup and management consulting.',
      authority: 'DMCC',
    },
    {},
  );

  assert.equal(result.ok, false);
  assert.equal(result.fieldErrors.preferredNames, 'Too small: expected array to have >=3 items');
});
