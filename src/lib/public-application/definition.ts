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
  activities: DEMO_ESTIMATOR_CATALOG.activities.map(
    ({ id, label, description, jurisdictions }) => ({
      id,
      label,
      description,
      jurisdictions: [...jurisdictions],
    }),
  ),
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
  fields: [
    ['application-full-name', 'contact', 'Full name', 'required-name'],
    ['application-nationality', 'contact', 'Nationality', 'required-name'],
    ['application-email', 'contact', 'Email', 'optional-valid-email'],
    ['application-phone', 'contact', 'Phone', 'optional-valid-phone'],
    ['application-contact-channel', 'contact', 'Contact channel', 'email-or-phone'],
    ['application-activity', 'business', 'Business activity', 'allowed-activity'],
    ['application-company-name-1', 'business', 'Preferred Company name', 'required-name'],
    ['application-company-names', 'business', 'Preferred Company names', 'bounded-names'],
    ['application-business-summary', 'business', 'Business summary', 'bounded-summary'],
    ['application-jurisdiction', 'setup', 'Jurisdiction', 'allowed-jurisdiction'],
    ['application-authority', 'setup', 'Authority', 'compatible-authority'],
    ['application-activity-compatibility', 'setup', 'Business activity', 'compatible-activity'],
    ['application-legal-structure', 'setup', 'Legal structure', 'compatible-legal-structure'],
    ['application-visas-required', 'setup', 'Visa requirements', 'required-choice'],
    ['application-investor-visas', 'setup', 'Investor visas', 'whole-number'],
    ['application-employee-visas', 'setup', 'Employee visas', 'whole-number'],
    ['application-family-visas', 'setup', 'Family visas', 'whole-number'],
    ['application-visa-total', 'setup', 'Visa total', 'authority-range'],
    ['application-office-type', 'setup', 'Office type', 'compatible-office'],
    ['application-office-notes', 'setup', 'Office notes', 'bounded-text'],
    ['application-add-ons', 'setup', 'Additional services', 'compatible-services'],
    ['application-shareholder-count', 'ownership', 'Shareholder count', 'authority-range'],
    ['application-shareholder-full-name', 'ownership', 'Shareholder full name', 'required-name'],
    [
      'application-shareholder-nationality',
      'ownership',
      'Shareholder nationality',
      'required-name',
    ],
    ['application-shareholder-ownership', 'ownership', 'Share percentage', 'basis-points'],
    ['application-ownership-total', 'ownership', 'Ownership total', 'exact-basis-points'],
    ['application-information-confirmation', 'review', 'Information confirmation', 'required'],
    ['application-data-consent', 'review', 'Data-processing consent', 'required'],
  ].map(([id, stepId, label, rule]) => ({
    id,
    stepId,
    label,
    rule,
  })) as ApplicationDefinition['fields'],
  limits: {
    nameMin: 2,
    nameMax: 160,
    emailMax: 254,
    phoneMax: 32,
    businessSummaryMin: 10,
    businessSummaryMax: 2000,
    companyNameMax: 120,
    officeNotesMax: 1000,
    ownershipTotalBasisPoints: 10000,
  },
  reviewSections: [
    { id: 'personal', label: 'Personal' },
    { id: 'business', label: 'Business' },
    { id: 'setup', label: 'Setup' },
    { id: 'services', label: 'Additional services' },
    { id: 'ownership', label: 'Ownership' },
  ],
  confirmationLabels: {
    heading: 'Application preview complete',
    mode: 'Local preview',
    notSent: 'No application was sent to Mandoob.',
  },
  legalLinks: { privacy: '/legal/privacy', terms: '/legal/terms' },
};

export type ApplicationDefinitionSource =
  | { status: 'ready'; definition: ApplicationDefinition }
  | { status: 'unavailable'; retryable: true; reason: 'invalid-definition' };

export function getApplicationDefinitionSource(input: unknown): ApplicationDefinitionSource {
  try {
    if (JSON.stringify(input) === JSON.stringify(APPLICATION_DEFINITION)) {
      return { status: 'ready', definition: input as ApplicationDefinition };
    }
  } catch {
    // Cyclic and non-serializable sources are unsupported.
  }
  return { status: 'unavailable', retryable: true, reason: 'invalid-definition' };
}

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
