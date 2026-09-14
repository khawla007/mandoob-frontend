import type { Jurisdiction, LegalStructure, OfficeType, Recurrence } from './calculate';

export type EstimatorSourceState =
  | { status: 'ready'; catalog: EstimatorCatalog }
  | { status: 'indicative-demo'; catalog: EstimatorCatalog }
  | {
      status: 'unavailable';
      retryable: boolean;
      reason: 'approved-catalog-required' | 'empty-source';
    }
  | { status: 'error'; retryable: boolean; reason: 'invalid-source' };

export type EstimatorActionStatus = 'idle' | 'pending' | 'success' | 'error' | 'unavailable';

export type EstimatorActionState = {
  status: EstimatorActionStatus;
  message?: string;
};

export type EstimatorCatalogOption = {
  id: string;
  label: string;
  description: string;
};

export type EstimatorActivity = EstimatorCatalogOption & {
  code: string;
  category: string;
  jurisdictions: Jurisdiction[];
};

export type EstimatorAuthority = EstimatorCatalogOption & {
  jurisdiction: Jurisdiction;
  emirate: string | null;
  activityIds: string[];
  legalStructureIds: LegalStructure[];
  officeTypeIds: OfficeType[];
  addOnIds: string[];
  shareholderRange: { min: number; max: number };
  visaRange: { min: number; max: number };
};

export type EstimatorFeeCategory =
  | 'authority'
  | 'government'
  | 'office'
  | 'visa_and_identity'
  | 'banking'
  | 'tax'
  | 'attestation'
  | 'professional_service';

export type EstimatorFee = {
  id: string;
  authorityId: string;
  activityId: string | null;
  feeType: string;
  label: string;
  category: EstimatorFeeCategory;
  sourceContext: string;
  recurrence: Recurrence;
  amountMinor: number;
  quantityBasis: 'flat' | 'additional_shareholder' | 'visa' | 'office' | 'add_on';
  optionId: string | null;
  timelineDays: { min: number; max: number };
  documentKeys: string[];
};

export type EstimatorCatalog = {
  id: string;
  version: string;
  currency: 'AED';
  sourceState: 'ready' | 'indicative-demo';
  sourceLabel: string;
  sourceContext: string;
  jurisdictions: Array<EstimatorCatalogOption & { id: Jurisdiction }>;
  authorities: EstimatorAuthority[];
  activities: EstimatorActivity[];
  legalStructures: Array<EstimatorCatalogOption & { id: LegalStructure }>;
  officeTypes: Array<EstimatorCatalogOption & { id: OfficeType }>;
  addOns: EstimatorCatalogOption[];
  fees: EstimatorFee[];
  documents: Array<EstimatorCatalogOption>;
  assumptions: string[];
  inclusions: string[];
  exclusions: string[];
};

export type EstimatorDraft = {
  jurisdiction: Jurisdiction | null;
  authorityId: string | null;
  activityId: string | null;
  legalStructureId: LegalStructure | null;
  shareholderCount: string;
  visaCount: string;
  officeTypeId: OfficeType | null;
  addOnIds: string[];
};

export type EstimatorValidationError = {
  step: number;
  fieldId: string;
  message: string;
};

export type EstimatorLineItem = {
  id: string;
  feeType: string;
  label: string;
  category: EstimatorFeeCategory;
  sourceContext: string;
  recurrence: Recurrence;
  quantity: number;
  amountMinor: number;
  totalMinor: number;
};

export type EstimatorResult = {
  reference: string;
  catalogVersion: string;
  sourceState: 'ready' | 'indicative-demo';
  sourceLabel: string;
  sourceContext: string;
  currency: 'AED';
  normalizedDraft: EstimatorDraft;
  lineItems: EstimatorLineItem[];
  oneTimeTotalMinor: number;
  annualTotalMinor: number;
  timelineDays: { min: number; max: number } | null;
  requiredDocumentKeys: string[];
  assumptions: string[];
  inclusions: string[];
  exclusions: string[];
  generatedAt: string;
};
