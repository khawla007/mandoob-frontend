import { createHash } from 'node:crypto';
import { formatMoney } from '@/lib/format/money';

export type Jurisdiction = 'mainland' | 'free_zone' | 'offshore';
export type Recurrence = 'one_time' | 'annual';
export type OfficeType = 'none' | 'flexi' | 'physical' | 'virtual';
export type LegalStructure = 'llc' | 'fz_llc' | 'branch' | 'offshore_company';
export type AddOn = 'bank_account' | 'tax_registration' | 'document_attestation';

export type EstimateInput = {
  jurisdiction: Jurisdiction;
  authority: string;
  emirate?: string | null;
  activityKey: string;
  shareholderCount: number;
  visaCount: number;
  legalStructure: LegalStructure;
  officeType: OfficeType;
  addOns?: AddOn[];
};

export type CostDataRow = {
  id: string;
  jurisdiction: Jurisdiction;
  authority: string;
  emirate: string | null;
  activityKey: string | null;
  feeType: string;
  label: string;
  amountMinor: number;
  recurrence: Recurrence;
  minShareholders: number;
  maxShareholders: number;
  minVisas: number;
  maxVisas: number;
  timelineMinDays: number;
  timelineMaxDays: number;
  requiredDocumentKeys: string[];
  active: boolean;
  validFrom: string;
  validTo: string | null;
  estimateGrade: boolean;
};

export type EstimateLineItem = {
  id: string;
  feeType: string;
  label: string;
  quantity: number;
  amountMinor: number;
  totalMinor: number;
  recurrence: Recurrence;
};

export type EstimateOutput = {
  reference: string;
  currency: 'AED';
  input: EstimateInput;
  lineItems: EstimateLineItem[];
  oneTimeTotalMinor: number;
  annualTotalMinor: number;
  oneTimeTotal: string;
  annualTotal: string;
  timelineDays: { min: number; max: number };
  requiredDocumentKeys: string[];
  assumptions: string[];
  generatedAt: string;
};

const JURISDICTIONS = new Set<Jurisdiction>(['mainland', 'free_zone', 'offshore']);
const OFFICE_TYPES = new Set<OfficeType>(['none', 'flexi', 'physical', 'virtual']);
const LEGAL_STRUCTURES = new Set<LegalStructure>(['llc', 'fz_llc', 'branch', 'offshore_company']);
const ADD_ONS = new Set<AddOn>(['bank_account', 'tax_registration', 'document_attestation']);

const BASE_FEE_TYPES = new Set(['license', 'registration']);

export class EstimateError extends Error {
  constructor(
    public code: 'INVALID_INPUT' | 'MISSING_COST_DATA' | 'UNSUPPORTED_COMBINATION',
    message: string,
  ) {
    super(message);
  }
}

export function isLegalStructureSupportedForJurisdiction(
  jurisdiction: Jurisdiction,
  legalStructure: LegalStructure,
): boolean {
  if (jurisdiction === 'mainland') return legalStructure === 'llc' || legalStructure === 'branch';
  if (jurisdiction === 'free_zone') return legalStructure === 'fz_llc' || legalStructure === 'branch';
  return legalStructure === 'offshore_company';
}

export function validateEstimateInput(input: EstimateInput): EstimateInput {
  if (!input || typeof input !== 'object') {
    throw new EstimateError('INVALID_INPUT', 'Estimator input is required');
  }
  if (!JURISDICTIONS.has(input.jurisdiction)) {
    throw new EstimateError('INVALID_INPUT', 'Unsupported jurisdiction');
  }
  if (!input.authority?.trim()) {
    throw new EstimateError('INVALID_INPUT', 'Authority is required');
  }
  if (!input.activityKey?.trim()) {
    throw new EstimateError('INVALID_INPUT', 'Activity key is required');
  }
  if (!Number.isInteger(input.shareholderCount) || input.shareholderCount < 1 || input.shareholderCount > 50) {
    throw new EstimateError('INVALID_INPUT', 'Shareholder count must be between 1 and 50');
  }
  if (!Number.isInteger(input.visaCount) || input.visaCount < 0 || input.visaCount > 200) {
    throw new EstimateError('INVALID_INPUT', 'Visa count must be between 0 and 200');
  }
  if (!LEGAL_STRUCTURES.has(input.legalStructure)) {
    throw new EstimateError('INVALID_INPUT', 'Unsupported legal structure');
  }
  if (!isLegalStructureSupportedForJurisdiction(input.jurisdiction, input.legalStructure)) {
    throw new EstimateError('UNSUPPORTED_COMBINATION', 'Legal structure is not supported for this jurisdiction');
  }
  if (!OFFICE_TYPES.has(input.officeType)) {
    throw new EstimateError('INVALID_INPUT', 'Unsupported office type');
  }
  for (const addOn of input.addOns ?? []) {
    if (!ADD_ONS.has(addOn)) throw new EstimateError('INVALID_INPUT', 'Unsupported add-on');
  }
  return { ...input, authority: input.authority.trim(), activityKey: input.activityKey.trim(), addOns: input.addOns ?? [] };
}

export function calculateEstimate(input: EstimateInput, rows: CostDataRow[], now = new Date()): EstimateOutput {
  const normalized = validateEstimateInput(input);
  const today = now.toISOString().slice(0, 10);
  const matchingRows = rows.filter((row) => rowMatchesInput(row, normalized, today));
  const lineItems = matchingRows.flatMap((row) => toLineItem(row, normalized));

  if (!lineItems.some((item) => item.feeType === 'license') || !lineItems.some((item) => item.feeType === 'registration')) {
    throw new EstimateError('MISSING_COST_DATA', 'Missing base cost data for this estimator selection');
  }
  if (normalized.officeType !== 'none' && !lineItems.some((item) => item.feeType === `office_${normalized.officeType}`)) {
    throw new EstimateError('MISSING_COST_DATA', 'Missing office cost data for this estimator selection');
  }
  if (normalized.visaCount > 0 && !lineItems.some((item) => item.feeType === 'visa')) {
    throw new EstimateError('MISSING_COST_DATA', 'Missing visa cost data for this estimator selection');
  }

  const oneTimeTotalMinor = sum(lineItems.filter((item) => item.recurrence === 'one_time').map((item) => item.totalMinor));
  const annualTotalMinor = sum(lineItems.filter((item) => item.recurrence === 'annual').map((item) => item.totalMinor));
  const includedRows = matchingRows.filter((row) => lineItems.some((item) => item.id === row.id));
  const reference = estimateReference(normalized, oneTimeTotalMinor, annualTotalMinor);

  return {
    reference,
    currency: 'AED',
    input: normalized,
    lineItems,
    oneTimeTotalMinor,
    annualTotalMinor,
    oneTimeTotal: formatMoney(oneTimeTotalMinor, 'AED'),
    annualTotal: formatMoney(annualTotalMinor, 'AED'),
    timelineDays: {
      min: sum(includedRows.map((row) => row.timelineMinDays)),
      max: sum(includedRows.map((row) => row.timelineMaxDays)),
    },
    requiredDocumentKeys: [...new Set(includedRows.flatMap((row) => row.requiredDocumentKeys))].sort(),
    assumptions: [
      'Estimate-grade public pricing. Government and authority fees may change.',
      'Final pricing depends on selected activity, authority approval, document readiness, and immigration quota.',
      'No lead is created until the Step 25 application questionnaire is submitted.',
    ],
    generatedAt: now.toISOString(),
  };
}

export function buildApplyNowUrl(input: EstimateInput, estimate: Pick<EstimateOutput, 'reference'>): URL {
  const normalized = validateEstimateInput(input);
  const url = new URL('/apply', 'https://mandoob.local');
  url.searchParams.set('estimate_ref', estimate.reference);
  url.searchParams.set('jurisdiction', normalized.jurisdiction);
  url.searchParams.set('authority', normalized.authority);
  if (normalized.emirate) url.searchParams.set('emirate', normalized.emirate);
  url.searchParams.set('activity', normalized.activityKey);
  url.searchParams.set('shareholders', String(normalized.shareholderCount));
  url.searchParams.set('visas', String(normalized.visaCount));
  url.searchParams.set('legal_structure', normalized.legalStructure);
  url.searchParams.set('office_type', normalized.officeType);
  if (normalized.addOns?.length) url.searchParams.set('addons', normalized.addOns.join(','));
  return url;
}

function rowMatchesInput(row: CostDataRow, input: EstimateInput, today: string): boolean {
  return (
    row.active &&
    row.estimateGrade &&
    row.jurisdiction === input.jurisdiction &&
    row.authority.toLowerCase() === input.authority.toLowerCase() &&
    (!row.emirate || !input.emirate || row.emirate.toLowerCase() === input.emirate.toLowerCase()) &&
    (!row.activityKey || row.activityKey === input.activityKey) &&
    row.minShareholders <= input.shareholderCount &&
    row.maxShareholders >= input.shareholderCount &&
    row.minVisas <= input.visaCount &&
    row.maxVisas >= input.visaCount &&
    row.validFrom <= today &&
    (!row.validTo || row.validTo >= today)
  );
}

function toLineItem(row: CostDataRow, input: EstimateInput): EstimateLineItem[] {
  const quantity = quantityForFee(row.feeType, input);
  if (quantity < 1) return [];
  return [
    {
      id: row.id,
      feeType: row.feeType,
      label: row.label,
      quantity,
      amountMinor: row.amountMinor,
      totalMinor: row.amountMinor * quantity,
      recurrence: row.recurrence,
    },
  ];
}

function quantityForFee(feeType: string, input: EstimateInput): number {
  if (BASE_FEE_TYPES.has(feeType)) return 1;
  if (feeType === `office_${input.officeType}`) return 1;
  if (feeType === 'shareholder') return Math.max(0, input.shareholderCount - 1);
  if (feeType === 'visa') return input.visaCount;
  for (const addOn of input.addOns ?? []) {
    if (feeType === `addon_${addOn}`) return 1;
  }
  return 0;
}

function estimateReference(input: EstimateInput, oneTimeTotalMinor: number, annualTotalMinor: number): string {
  const digest = createHash('sha256').update(JSON.stringify({ input, oneTimeTotalMinor, annualTotalMinor })).digest('hex');
  const token = BigInt(`0x${digest.slice(0, 12)}`).toString(36).toUpperCase().padStart(10, '0').slice(0, 10);
  return `EST-${token}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
