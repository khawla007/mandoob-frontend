import type { Jurisdiction, LegalStructure, OfficeType } from '@/lib/estimator/calculate';

export type ApplicationStepId = 'contact' | 'business' | 'setup' | 'ownership' | 'review';
export type SetupSubstepId = 'jurisdiction' | 'authority' | 'visas' | 'office' | 'services';

export type ApplicationChoice = {
  id: string;
  label: string;
  description: string;
};

export type ApplicationFieldDefinition = {
  id: string;
  stepId: ApplicationStepId;
  label: string;
  rule: string;
};

export type ApplicationAuthority = ApplicationChoice & {
  jurisdiction: Jurisdiction;
  activityIds: string[];
  legalStructureIds: LegalStructure[];
  officeTypeIds: OfficeType[];
  addOnIds: string[];
  shareholderRange: { min: number; max: number };
  visaRange: { min: number; max: number };
};

export type ApplicationDefinition = {
  id: 'mandoob-public-company-application';
  version: string;
  steps: ReadonlyArray<{ id: ApplicationStepId; label: string }>;
  setupSubsteps: ReadonlyArray<{ id: SetupSubstepId; label: string }>;
  jurisdictions: ReadonlyArray<ApplicationChoice & { id: Jurisdiction }>;
  authorities: ReadonlyArray<ApplicationAuthority>;
  activities: ReadonlyArray<ApplicationChoice & { jurisdictions: Jurisdiction[] }>;
  legalStructures: ReadonlyArray<ApplicationChoice & { id: LegalStructure }>;
  officeTypes: ReadonlyArray<ApplicationChoice & { id: OfficeType }>;
  addOns: ReadonlyArray<ApplicationChoice>;
  documents: ReadonlyArray<ApplicationChoice>;
  conditions: ReadonlyArray<
    | { fieldId: 'visa-counts'; when: 'visas-required' }
    | { fieldId: 'office-notes'; when: 'office-selected' }
  >;
  documentRules: ReadonlyArray<{
    id: 'contact-passport' | 'business-plan' | 'shareholder-passport';
    documentId: string;
    owner: 'contact' | 'business' | 'each-shareholder';
    required: boolean;
    previewOnly: true;
  }>;
  fields: ReadonlyArray<ApplicationFieldDefinition>;
  limits: {
    nameMin: 2;
    nameMax: 160;
    emailMax: 254;
    phoneMax: 32;
    businessSummaryMin: 10;
    businessSummaryMax: 2000;
    companyNameMax: 120;
    officeNotesMax: 1000;
    ownershipTotalBasisPoints: 10000;
  };
  reviewSections: ReadonlyArray<{
    id: 'personal' | 'business' | 'setup' | 'services' | 'ownership';
    label: string;
  }>;
  confirmationLabels: {
    heading: 'Application preview complete';
    mode: 'Local preview';
    notSent: 'No application was sent to Mandoob.';
  };
  legalLinks: { privacy: '/legal/privacy'; terms: '/legal/terms' };
};

export type IndividualShareholder = {
  id: `shareholder-${number}`;
  kind: 'individual';
  fullName: string;
  nationality: string;
  /** Integer hundredths of one percent. All rows must sum to exactly 10,000. */
  ownershipBasisPoints: string;
};

export type ApplicationDraft = {
  contact: { fullName: string; nationality: string; email: string; phone: string };
  business: {
    activityId: string | null;
    preferredNames: [string, string, string];
    summary: string;
  };
  setup: {
    jurisdiction: Jurisdiction | null;
    authorityId: string | null;
    legalStructureId: LegalStructure | null;
    officeTypeId: OfficeType | null;
    officeNotes: string;
    addOnIds: string[];
  };
  visas: {
    required: boolean | null;
    investorCount: string;
    employeeCount: string;
    familyCount: string;
    estimatorTotalSuggestion: number | null;
  };
  shareholders: IndividualShareholder[];
  documentReadiness: Record<string, 'ready' | 'not-ready'>;
  confirmations: { informationIsTrue: boolean; dataProcessingConsent: boolean };
};

type EnvelopeFields = {
  schemaVersion: 1;
  definitionVersion: string;
  savedAt: string;
  expiresAt: string;
  draft: ApplicationDraft;
};

export type ApplicationDraftEnvelope =
  | (EnvelopeFields & { storage: 'session'; expiresAt: string })
  | (EnvelopeFields & { storage: 'local'; expiresAt: string });

export type ApplicationValidationError = {
  stepId: ApplicationStepId;
  fieldId: string;
  code: 'required' | 'invalid' | 'incompatible' | 'ownership-total';
  message: string;
  href: `#${string}`;
};

export type ApplicationStepStatus = 'incomplete' | 'invalid' | 'complete';
export type ApplicationValidation =
  | {
      status: 'valid';
      errors: [];
      firstInvalidControlId: null;
      steps: Record<ApplicationStepId, ApplicationStepStatus>;
    }
  | {
      status: 'invalid';
      errors: ApplicationValidationError[];
      firstInvalidControlId: string;
      steps: Record<ApplicationStepId, ApplicationStepStatus>;
    };

export type ApplicationConfirmationSummary = {
  jurisdiction: Jurisdiction;
  authorityId: string;
  activityId: string;
  legalStructureId: LegalStructure;
  shareholderCount: number;
  visaCount: number;
  officeTypeId: OfficeType;
  addOnIds: string[];
  readyDocumentCount: number;
};

export type ApplicationConfirmation =
  | { status: 'none' }
  | {
      status: 'confirmed-preview';
      sent: false;
      mode: 'local-preview';
      demoReference?: string;
      summary: ApplicationConfirmationSummary;
    };

export type ApplicationActionState =
  | { status: 'idle' }
  | { status: 'pending' }
  | {
      status: 'confirmed-preview';
      confirmation: Extract<ApplicationConfirmation, { status: 'confirmed-preview' }>;
    }
  | { status: 'duplicate'; retryable: true; message: string }
  | { status: 'rate-limited'; retryable: true; message: string }
  | { status: 'unavailable'; retryable: boolean; message: string }
  | { status: 'error'; retryable: boolean; message: string };

export type ApplicationWorkspaceState = {
  draft: ApplicationDraft;
  action: ApplicationActionState;
};

declare const validatedCompletion: unique symbol;
export type ApplicationCompletionInput = ApplicationConfirmationSummary & {
  readonly [validatedCompletion]: true;
};
export type ApplicationAdapter = {
  complete(
    input: ApplicationCompletionInput,
  ): Promise<Exclude<ApplicationActionState, { status: 'idle' | 'pending' }>>;
};

export type EstimatorApplicationHandoff = {
  reference: string;
  jurisdiction: Jurisdiction;
  authorityId: string;
  activityId: string;
  shareholderCount: number;
  visaTotalSuggestion: number;
  legalStructureId: LegalStructure;
  officeTypeId: OfficeType;
  addOnIds: string[];
};

export type EstimatorHandoffResult =
  | { status: 'accepted'; value: EstimatorApplicationHandoff }
  | { status: 'rejected'; reason: 'invalid-estimator-handoff' };
