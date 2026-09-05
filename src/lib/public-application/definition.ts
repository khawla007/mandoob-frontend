import { DEMO_ESTIMATOR_CATALOG } from '@/lib/estimator/public-demo-catalog';
import type { ApplicationDefinition, ApplicationDraft } from './contracts';

export const APPLICATION_DEFINITION_VERSION = 'p1.09-reviewed-2026-09-05';

export const APPLICATION_DEFINITION: ApplicationDefinition = {
  id: 'mandoob-public-company-application',
  version: APPLICATION_DEFINITION_VERSION,
  steps: [
    { id: 'contact', label: 'Contact' },
    { id: 'business', label: 'Business Details' },
    { id: 'setup', label: 'Setup' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'review', label: 'Review' },
  ],
  setupSubsteps: [
    { id: 'jurisdiction', label: 'Jurisdiction' },
    { id: 'authority', label: 'Authority' },
    { id: 'visas', label: 'Visa requirements' },
    { id: 'office', label: 'Office requirement' },
    { id: 'services', label: 'Additional services' },
  ],
  jurisdictions: DEMO_ESTIMATOR_CATALOG.jurisdictions.map((item) => ({ ...item })),
  authorities: DEMO_ESTIMATOR_CATALOG.authorities.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    jurisdiction: item.jurisdiction,
    activityIds: [...item.activityIds],
    legalStructureIds: [...item.legalStructureIds],
    officeTypeIds: [...item.officeTypeIds],
    addOnIds: [...item.addOnIds],
    shareholderRange: { ...item.shareholderRange },
    visaRange: { ...item.visaRange },
  })),
  activities: DEMO_ESTIMATOR_CATALOG.activities.map(({ id, label, description }) => ({
    id,
    label,
    description,
  })),
  legalStructures: DEMO_ESTIMATOR_CATALOG.legalStructures.map((item) => ({ ...item })),
  officeTypes: DEMO_ESTIMATOR_CATALOG.officeTypes.map((item) => ({ ...item })),
  addOns: DEMO_ESTIMATOR_CATALOG.addOns.map((item) => ({ ...item })),
  documents: DEMO_ESTIMATOR_CATALOG.documents.map((item) => ({ ...item })),
  conditions: [
    { fieldId: 'visa-counts', when: 'visas-required' },
    { fieldId: 'office-notes', when: 'office-selected' },
  ],
  documentRules: [
    {
      id: 'contact-passport',
      documentId: 'passport-copy',
      owner: 'contact',
      required: true,
      previewOnly: true,
    },
    {
      id: 'business-plan',
      documentId: 'activity-summary',
      owner: 'business',
      required: false,
      previewOnly: true,
    },
    {
      id: 'shareholder-passport',
      documentId: 'passport-copy',
      owner: 'each-shareholder',
      required: true,
      previewOnly: true,
    },
  ],
  legalLinks: { privacy: '/legal/privacy', terms: '/legal/terms' },
};

export const EMPTY_APPLICATION_DRAFT: ApplicationDraft = {
  contact: { fullName: '', nationality: '', email: '', phone: '' },
  business: { activityId: null, preferredNames: ['', '', ''], summary: '' },
  setup: {
    jurisdiction: null,
    authorityId: null,
    legalStructureId: null,
    officeTypeId: null,
    officeNotes: '',
    addOnIds: [],
  },
  visas: {
    required: null,
    investorCount: '',
    employeeCount: '',
    familyCount: '',
    estimatorTotalSuggestion: null,
  },
  shareholders: [emptyShareholder(1)],
  documentReadiness: {},
  confirmations: { informationIsTrue: false, dataProcessingConsent: false },
};

export function emptyShareholder(index: number): ApplicationDraft['shareholders'][number] {
  return {
    id: `shareholder-${index}`,
    kind: 'individual',
    fullName: '',
    nationality: '',
    ownershipBasisPoints: '',
  };
}
