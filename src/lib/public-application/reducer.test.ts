import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPLICATION_DEFINITION,
  EMPTY_APPLICATION_DRAFT,
  reduceApplicationDraft,
  reduceApplicationWorkspace,
  type ApplicationDraft,
} from './index';

const completedDraft: ApplicationDraft = {
  ...EMPTY_APPLICATION_DRAFT,
  contact: {
    fullName: 'Example Person',
    nationality: 'AE',
    email: 'person@example.test',
    phone: '',
  },
  business: {
    activityId: 'professional-services',
    preferredNames: ['Example One', '', ''],
    summary: 'A sufficiently detailed business activity summary.',
  },
  setup: {
    jurisdiction: 'free_zone',
    authorityId: 'dmcc',
    legalStructureId: 'fz_llc',
    officeTypeId: 'flexi',
    officeNotes: 'Shared desk preference',
    addOnIds: ['bank-account-assistance'],
  },
  visas: {
    required: true,
    investorCount: '1',
    employeeCount: '1',
    familyCount: '0',
    estimatorTotalSuggestion: 2,
  },
  shareholders: [
    {
      id: 'shareholder-1',
      kind: 'individual',
      fullName: 'Example Person',
      nationality: 'AE',
      ownershipBasisPoints: '10000',
    },
  ],
  documentReadiness: { 'passport-copy:shareholder-1': 'ready' },
  confirmations: { informationIsTrue: true, dataProcessingConsent: true },
};

test('clean application flow can choose a canonical activity before setup authority', () => {
  const businessFirst = reduceApplicationDraft(
    EMPTY_APPLICATION_DRAFT,
    { type: 'set-activity', value: 'professional-services' },
    APPLICATION_DEFINITION,
  );
  assert.equal(businessFirst.business.activityId, 'professional-services');

  const jurisdiction = reduceApplicationDraft(
    businessFirst,
    { type: 'set-jurisdiction', value: 'free_zone' },
    APPLICATION_DEFINITION,
  );
  assert.equal(jurisdiction.business.activityId, 'professional-services');
  const incompatibleJurisdiction = reduceApplicationDraft(
    jurisdiction,
    { type: 'set-jurisdiction', value: 'offshore' },
    APPLICATION_DEFINITION,
  );
  assert.equal(incompatibleJurisdiction.business.activityId, null);
});

test('jurisdiction and authority changes clear incompatible dependants and stale review state', () => {
  assert.equal(
    reduceApplicationDraft(
      completedDraft,
      { type: 'set-jurisdiction', value: 'free_zone' },
      APPLICATION_DEFINITION,
    ),
    completedDraft,
  );
  const jurisdictionChanged = reduceApplicationDraft(
    completedDraft,
    { type: 'set-jurisdiction', value: 'offshore' },
    APPLICATION_DEFINITION,
  );
  assert.deepEqual(jurisdictionChanged.setup, {
    jurisdiction: 'offshore',
    authorityId: null,
    legalStructureId: null,
    officeTypeId: null,
    officeNotes: '',
    addOnIds: ['bank-account-assistance'],
  });
  assert.deepEqual(jurisdictionChanged.visas, {
    required: null,
    investorCount: '',
    employeeCount: '',
    familyCount: '',
    estimatorTotalSuggestion: null,
  });
  assert.deepEqual(jurisdictionChanged.documentReadiness, {});
  assert.deepEqual(jurisdictionChanged.confirmations, {
    informationIsTrue: false,
    dataProcessingConsent: false,
  });

  const authorityChanged = reduceApplicationDraft(
    completedDraft,
    { type: 'set-authority', value: 'dubai-mainland' },
    APPLICATION_DEFINITION,
  );
  assert.equal(authorityChanged.setup.authorityId, null, 'mismatched authority is rejected');
  assert.equal(authorityChanged.business.activityId, null);
  assert.equal(authorityChanged.setup.legalStructureId, null);
  assert.equal(authorityChanged.setup.officeTypeId, null);
});

test('compatible upstream edits retain compatible values and only clear stale context', () => {
  const changed = reduceApplicationDraft(
    { ...completedDraft, setup: { ...completedDraft.setup, legalStructureId: 'branch' } },
    { type: 'set-jurisdiction', value: 'mainland' },
    APPLICATION_DEFINITION,
  );
  assert.equal(changed.business.activityId, 'professional-services');
  assert.equal(changed.setup.legalStructureId, 'branch');
  assert.equal(changed.setup.authorityId, null);
  assert.equal(changed.setup.officeTypeId, null);
  assert.equal(
    reduceApplicationDraft(
      completedDraft,
      { type: 'set-authority', value: 'dmcc' },
      APPLICATION_DEFINITION,
    ),
    completedDraft,
  );
});

test('all contact and business material edits clear consent and confirmed state', () => {
  for (const action of [
    { type: 'set-contact-field', field: 'email', value: 'changed@example.test' },
    { type: 'set-business-summary', value: 'A changed and still sufficient summary.' },
    { type: 'set-preferred-name', index: 0, value: 'Changed Company' },
  ] as const) {
    const state = reduceApplicationWorkspace(
      {
        draft: completedDraft,
        action: { status: 'duplicate', retryable: true, message: 'Synthetic state.' },
      },
      action,
      APPLICATION_DEFINITION,
    );
    assert.equal(state.action.status, 'idle');
    assert.deepEqual(state.draft.confirmations, {
      informationIsTrue: false,
      dataProcessingConsent: false,
    });
  }

  const unchecked = reduceApplicationWorkspace(
    { draft: completedDraft, action: { status: 'pending' } },
    { type: 'set-confirmation', field: 'informationIsTrue', value: false },
    APPLICATION_DEFINITION,
  );
  assert.equal(unchecked.action.status, 'idle');
  assert.deepEqual(unchecked.draft.confirmations, {
    informationIsTrue: false,
    dataProcessingConsent: false,
  });
});

test('visa and office edits invalidate dependent context without manufacturing values', () => {
  const visasDisabled = reduceApplicationDraft(
    completedDraft,
    { type: 'set-visas-required', value: false },
    APPLICATION_DEFINITION,
  );
  assert.deepEqual(visasDisabled.visas, {
    required: false,
    investorCount: '',
    employeeCount: '',
    familyCount: '',
    estimatorTotalSuggestion: null,
  });
  assert.equal(visasDisabled.setup.officeTypeId, 'flexi');
  assert.equal(Object.keys(visasDisabled.documentReadiness).length, 0);

  const officeChanged = reduceApplicationDraft(
    completedDraft,
    { type: 'set-office-type', value: 'none' },
    APPLICATION_DEFINITION,
  );
  assert.equal(officeChanged.setup.officeTypeId, null, 'unsupported office is not substituted');
  assert.equal(officeChanged.setup.officeNotes, '');
  assert.deepEqual(officeChanged.documentReadiness, {});
});

test('shareholder count reconciliation preserves rows, appends stable IDs, and removes stale documents', () => {
  const expanded = reduceApplicationDraft(
    completedDraft,
    { type: 'set-shareholder-count', value: 3 },
    APPLICATION_DEFINITION,
  );
  assert.equal(expanded.shareholders[0], completedDraft.shareholders[0]);
  assert.deepEqual(
    expanded.shareholders.map((row) => row.id),
    ['shareholder-1', 'shareholder-2', 'shareholder-3'],
  );

  const reduced = reduceApplicationDraft(
    expanded,
    { type: 'set-shareholder-count', value: 1 },
    APPLICATION_DEFINITION,
  );
  assert.deepEqual(
    reduced.shareholders.map((row) => row.id),
    ['shareholder-1'],
  );
  assert.deepEqual(reduced.documentReadiness, {});
});

test('document and other material edits always invalidate consent and confirmed preview', () => {
  const changed = reduceApplicationDraft(
    completedDraft,
    {
      type: 'set-document-readiness',
      value: 'not-ready',
      documentId: 'passport-copy:shareholder-1',
    },
    APPLICATION_DEFINITION,
  );
  assert.deepEqual(changed.confirmations, {
    informationIsTrue: false,
    dataProcessingConsent: false,
  });

  const workspace = reduceApplicationWorkspace(
    {
      draft: completedDraft,
      action: {
        status: 'confirmed-preview',
        confirmation: {
          status: 'confirmed-preview',
          sent: false,
          mode: 'local-preview',
          demoReference: 'DEMO-0000000001',
          summary: {
            jurisdiction: 'free_zone',
            authorityId: 'dmcc',
            activityId: 'professional-services',
            legalStructureId: 'fz_llc',
            shareholderCount: 1,
            visaCount: 2,
            officeTypeId: 'flexi',
            addOnIds: [],
            readyDocumentCount: 1,
          },
        },
      },
    },
    { type: 'set-office-notes', value: 'Changed preference' },
    APPLICATION_DEFINITION,
  );
  assert.equal(workspace.action.status, 'idle');
  assert.equal(workspace.draft.confirmations.informationIsTrue, false);
});

test('document readiness rejects keys outside the current definition and shareholder rows', () => {
  for (const documentId of [
    'passport-copy:shareholder-999',
    'unknown-document:shareholder-1',
    'passport-copy:business',
  ]) {
    assert.equal(
      reduceApplicationDraft(
        completedDraft,
        { type: 'set-document-readiness', value: 'ready', documentId },
        APPLICATION_DEFINITION,
      ),
      completedDraft,
      documentId,
    );
  }

  const accepted = reduceApplicationDraft(
    completedDraft,
    {
      type: 'set-document-readiness',
      value: 'ready',
      documentId: 'activity-summary:business',
    },
    APPLICATION_DEFINITION,
  );
  assert.equal(accepted.documentReadiness['activity-summary:business'], 'ready');

  const sanitized = reduceApplicationDraft(
    {
      ...completedDraft,
      documentReadiness: {
        ...completedDraft.documentReadiness,
        'unknown-document:contact': 'ready',
      },
    },
    {
      type: 'set-document-readiness',
      value: 'not-ready',
      documentId: 'passport-copy:contact',
    },
    APPLICATION_DEFINITION,
  );
  assert.equal('unknown-document:contact' in sanitized.documentReadiness, false);
});

test('semantically unchanged reducer actions are identity-preserving no-ops', () => {
  const actions = [
    { type: 'set-add-ons', value: ['bank-account-assistance'] },
    { type: 'set-shareholder-count', value: 1 },
    {
      type: 'set-shareholder-field',
      shareholderId: 'shareholder-1',
      field: 'fullName',
      value: 'Example Person',
    },
    {
      type: 'set-shareholder-field',
      shareholderId: 'shareholder-999',
      field: 'fullName',
      value: 'Nobody',
    },
    {
      type: 'set-document-readiness',
      documentId: 'passport-copy:shareholder-1',
      value: 'ready',
    },
  ] as const;

  for (const action of actions) {
    assert.equal(
      reduceApplicationDraft(completedDraft, action, APPLICATION_DEFINITION),
      completedDraft,
      action.type,
    );
    const workspace = {
      draft: completedDraft,
      action: { status: 'pending' as const },
    };
    assert.equal(
      reduceApplicationWorkspace(workspace, action, APPLICATION_DEFINITION),
      workspace,
      action.type,
    );
  }
});
