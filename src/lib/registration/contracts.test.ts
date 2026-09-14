import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REGISTRATION_STAGE_CODES,
  REGISTRATION_STAGE_STATUSES,
  REGISTRATION_HISTORY_TRANSITIONS,
  REGISTRATION_ACTION_PREREQUISITES,
  VISA_MILESTONE_CODES,
  countRegistrationProgress,
  maySkipRegistrationStage,
  sortRegistrationHistory,
  formatDubaiRegistrationTimestamp,
  validateRegistrationStages,
  validateVisaPerson,
  type RegistrationHistoryView,
  type RegistrationStageView,
  type VisaPersonView,
} from './contracts';

const registrationStages = (statuses: RegistrationStageView['status'][]): RegistrationStageView[] =>
  REGISTRATION_STAGE_CODES.map((code, index) => ({
    code,
    ordinal: index + 1,
    status: statuses[index],
    startedAt: null,
    completedAt: null,
    blocker: null,
    nextAction: null,
    documents: [],
  }));

test('uses the exact seven registration stages and five source statuses', () => {
  assert.deepEqual(REGISTRATION_STAGE_CODES, [
    'application_submitted',
    'initial_approval',
    'name_reservation',
    'license_issuance',
    'visa_processing',
    'bank_account',
    'completed',
  ]);
  assert.deepEqual(REGISTRATION_STAGE_STATUSES, [
    'not_started',
    'in_progress',
    'blocked',
    'completed',
    'skipped',
  ]);
  assert.equal(new Set(REGISTRATION_STAGE_CODES).size, 7);
});

test('history transitions and action prerequisites are allowlisted presentation codes', () => {
  assert.deepEqual(REGISTRATION_ACTION_PREREQUISITES, [
    'none',
    'stage_predecessor',
    'authority_response',
    'customer_document',
    'payment',
    'visa_completion',
    'source_contract',
  ]);
  assert.deepEqual(REGISTRATION_HISTORY_TRANSITIONS, [
    'registration_created',
    'stage_started',
    'stage_blocked',
    'stage_unblocked',
    'stage_completed',
    'stage_skipped',
    'document_linked',
    'document_unlinked',
    'visa_person_created',
    'visa_milestone_changed',
    'visa_person_cancelled',
    'registration_recovered',
  ]);
});

test('permits skips only for visa processing and bank account', () => {
  assert.deepEqual(REGISTRATION_STAGE_CODES.filter(maySkipRegistrationStage), [
    'visa_processing',
    'bank_account',
  ]);
  assert.throws(() =>
    validateRegistrationStages(
      registrationStages([
        'skipped',
        'not_started',
        'not_started',
        'not_started',
        'not_started',
        'not_started',
        'not_started',
      ]),
    ),
  );
});

test('rejects stage order drift and jumping over an unfinished predecessor', () => {
  const wrongOrder = registrationStages(Array(7).fill('not_started'));
  wrongOrder[0] = { ...wrongOrder[0], code: 'initial_approval' };
  assert.throws(() => validateRegistrationStages(wrongOrder));

  assert.throws(() =>
    validateRegistrationStages(
      registrationStages([
        'completed',
        'not_started',
        'completed',
        'not_started',
        'not_started',
        'not_started',
        'not_started',
      ]),
    ),
  );
});

test('counts progress only after validating a complete seven-stage snapshot', () => {
  const progress = countRegistrationProgress(
    registrationStages([
      'completed',
      'completed',
      'completed',
      'completed',
      'skipped',
      'in_progress',
      'not_started',
    ]),
  );
  assert.deepEqual(progress, { completed: 4, resolved: 5, total: 7 });
  assert.throws(() => countRegistrationProgress([]));
});

test('uses the exact six independent visa milestones', () => {
  assert.deepEqual(VISA_MILESTONE_CODES, [
    'documents_ready',
    'entry_permit',
    'status_adjustment',
    'medical_fitness',
    'emirates_id',
    'residency_issued',
  ]);
  const person: VisaPersonView = {
    key: 'person-1',
    displayName: 'Synthetic Person',
    category: 'employee',
    status: 'active',
    stages: VISA_MILESTONE_CODES.map((code, index) => ({
      code,
      ordinal: index + 1,
      status: index === 0 ? 'active' : 'not_started',
      completedAt: null,
    })),
    blocker: null,
    nextAction: null,
    documents: [],
    history: [],
  };
  assert.deepEqual(validateVisaPerson(person), person);
  assert.throws(() => validateVisaPerson({ ...person, stages: person.stages.slice(0, 5) }));
});

test('orders immutable history chronologically with a stable tie-breaker', () => {
  const event = (key: string, occurredAt: string): RegistrationHistoryView => ({
    key,
    actorCategory: 'system',
    transition: 'stage_completed',
    reasonCategory: null,
    occurredAt,
  });
  assert.deepEqual(
    sortRegistrationHistory([
      event('b', '2026-09-05T08:00:00.000Z'),
      event('c', '2026-09-05T07:00:00.000Z'),
      event('a', '2026-09-05T08:00:00.000Z'),
    ]).map(({ key }) => key),
    ['c', 'a', 'b'],
  );
});

test('formats immutable history timestamps in the Dubai timezone', () => {
  assert.equal(
    formatDubaiRegistrationTimestamp('2026-09-05T20:30:00.000Z', 'en-GB'),
    '6 Sept 2026, 00:30',
  );
  assert.equal(formatDubaiRegistrationTimestamp('invalid', 'en-GB'), null);
});
