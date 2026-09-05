import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { APPLICATION_DEFINITION } from './definition';
import {
  createDemoApplicationAdapter,
  EMPTY_APPLICATION_DRAFT,
  parseEstimatorApplicationHandoff,
  prepareApplicationCompletion,
  productionApplicationAdapter,
  type ApplicationDraft,
} from './index';

const validDraft: ApplicationDraft = {
  ...EMPTY_APPLICATION_DRAFT,
  contact: {
    fullName: 'Example Person',
    nationality: 'AE',
    email: 'person@example.test',
    phone: '',
  },
  business: {
    activityId: 'professional-services',
    preferredNames: ['Example Company', '', ''],
    summary: 'A sufficiently detailed business activity summary.',
  },
  setup: {
    jurisdiction: 'free_zone',
    authorityId: 'dmcc',
    legalStructureId: 'fz_llc',
    officeTypeId: 'flexi',
    officeNotes: '',
    addOnIds: ['bank-account-assistance'],
  },
  visas: {
    required: true,
    investorCount: '1',
    employeeCount: '1',
    familyCount: '1',
    estimatorTotalSuggestion: 3,
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
  confirmations: { informationIsTrue: true, dataProcessingConsent: true },
};

test('strict handoff accepts exact P1.08 values and keeps visas as a suggestion only', () => {
  const result = parseEstimatorApplicationHandoff(
    new URLSearchParams(
      'estimate_ref=EST-DEMO-ABC1234&jurisdiction=free_zone&authority=dmcc&activity=professional-services&shareholders=2&visas=3&legal_structure=fz_llc&office_type=flexi&addons=bank-account-assistance,tax-registration-assistance',
    ),
    APPLICATION_DEFINITION,
  );
  assert.deepEqual(result, {
    status: 'accepted',
    value: {
      reference: 'EST-DEMO-ABC1234',
      jurisdiction: 'free_zone',
      authorityId: 'dmcc',
      activityId: 'professional-services',
      shareholderCount: 2,
      visaTotalSuggestion: 3,
      legalStructureId: 'fz_llc',
      officeTypeId: 'flexi',
      addOnIds: ['bank-account-assistance', 'tax-registration-assistance'],
    },
  });
  assert.equal('investorCount' in result, false);
});

test('handoff rejects repeated, oversized, unknown, unsafe, incomplete, and mismatched input', () => {
  const cases = [
    'jurisdiction=free_zone&jurisdiction=mainland',
    `estimate_ref=${'A'.repeat(121)}`,
    'jurisdiction=free_zone&email=person@example.test',
    'jurisdiction=%3Cscript%3E',
    'estimate_ref=EST-DEMO-ABC1234&jurisdiction=free_zone',
    'estimate_ref=EST-DEMO-ABC1234&jurisdiction=free_zone&authority=dubai-mainland&activity=professional-services&shareholders=2&visas=1&legal_structure=fz_llc&office_type=flexi',
    'estimate_ref=EST-DEMO-ABC1234&jurisdiction=free_zone&authority=dmcc&activity=holding-activities&shareholders=2&visas=1&legal_structure=fz_llc&office_type=flexi',
  ];
  for (const query of cases) {
    assert.deepEqual(
      parseEstimatorApplicationHandoff(new URLSearchParams(query), APPLICATION_DEFINITION),
      { status: 'rejected', reason: 'invalid-estimator-handoff' },
      query,
    );
  }
});

test('demo and production adapters return truthful no-write discriminated results', async () => {
  const prepared = prepareApplicationCompletion(validDraft, APPLICATION_DEFINITION);
  assert.equal(prepared.status, 'ready');
  if (prepared.status !== 'ready') return;
  const unavailable = await productionApplicationAdapter.complete(prepared.value);
  assert.deepEqual(unavailable, {
    status: 'unavailable',
    retryable: false,
    message: 'Online submission is not connected yet. No application was sent.',
  });

  const demo = await createDemoApplicationAdapter('confirmed-preview').complete(prepared.value);
  assert.equal(demo.status, 'confirmed-preview');
  if (demo.status === 'confirmed-preview') {
    assert.equal(demo.confirmation.sent, false);
    assert.equal(demo.confirmation.mode, 'local-preview');
    assert.match(demo.confirmation.demoReference ?? '', /^DEMO-[A-Z0-9]{10}$/u);
    assert.equal(JSON.stringify(demo.confirmation).includes('Example Person'), false);
  }
});

test('demo confirmation rejects arbitrary summaries and drafts without both consents', async () => {
  const arbitrary = await createDemoApplicationAdapter('confirmed-preview').complete({} as never);
  assert.deepEqual(arbitrary, {
    status: 'error',
    retryable: false,
    message: 'Complete validation and both confirmations before previewing the application.',
  });
  assert.equal(
    prepareApplicationCompletion(
      {
        ...validDraft,
        confirmations: { informationIsTrue: true, dataProcessingConsent: false },
      },
      APPLICATION_DEFINITION,
    ).status,
    'invalid',
  );
});

test('validated completion is an immutable allowlisted snapshot', async () => {
  const sourceDraft = structuredClone(validDraft);
  const prepared = prepareApplicationCompletion(sourceDraft, APPLICATION_DEFINITION);
  assert.equal(prepared.status, 'ready');
  if (prepared.status !== 'ready') return;

  const snapshot = prepared.value as unknown as Record<string, unknown>;
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.addOnIds), true);
  assert.throws(() => {
    snapshot.authorityId = 'tampered-authority';
  }, TypeError);
  assert.throws(() => {
    (snapshot.addOnIds as string[]).push('tampered-addon');
  }, TypeError);
  assert.throws(() => {
    snapshot.fullName = 'Injected Person';
  }, TypeError);

  sourceDraft.setup.authorityId = 'tampered-after-validation';
  sourceDraft.setup.addOnIds.push('tampered-after-validation');
  const result = await createDemoApplicationAdapter('confirmed-preview').complete(prepared.value);
  assert.equal(result.status, 'confirmed-preview');
  if (result.status === 'confirmed-preview') {
    assert.equal(result.confirmation.summary.authorityId, 'dmcc');
    assert.deepEqual(result.confirmation.summary.addOnIds, ['bank-account-assistance']);
    assert.deepEqual(Object.keys(result.confirmation.summary).sort(), [
      'activityId',
      'addOnIds',
      'authorityId',
      'jurisdiction',
      'legalStructureId',
      'officeTypeId',
      'readyDocumentCount',
      'shareholderCount',
      'visaCount',
    ]);
  }
});

test('adapter graph is isolated from the preserved live questionnaire path and network calls', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourceRoot = resolve(here, '../..');
  assert.ok(readFileSync(join(sourceRoot, 'app/api/v1/public/questionnaire/handler.ts'), 'utf8'));
  assert.ok(readFileSync(join(sourceRoot, 'lib/data/leads.ts'), 'utf8'));

  const visited = new Set<string>();
  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /\/api\/v1\/public\/questionnaire|\bfetch\s*\(|createLeadFromQuestionnaire|service-role|supabase/iu,
    );
    for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/gu)) {
      const target = resolve(dirname(file), match[1]);
      for (const candidate of [`${target}.ts`, join(target, 'index.ts')]) {
        try {
          visit(candidate);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  };

  visit(join(here, 'adapters.ts'));
  assert.ok(
    [...visited].every((file) => relative(sourceRoot, file).startsWith('lib/public-application/')),
  );
});
