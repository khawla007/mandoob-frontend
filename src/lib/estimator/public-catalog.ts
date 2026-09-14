import { z } from 'zod';
import { DEMO_ESTIMATOR_CATALOG } from './public-demo-catalog';
import { getSelectedAuthority, validateEstimatorDraft } from './public-draft';
import type {
  EstimatorCatalog,
  EstimatorDraft,
  EstimatorFee,
  EstimatorLineItem,
  EstimatorResult,
  EstimatorSourceState,
} from './public-contracts';

const id = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/u);
const key = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const text = z.string().trim().min(1).max(500);
const option = z.object({ id, label: text, description: text });
const range = z.object({
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
});
const fee = z.object({
  id,
  authorityId: id,
  activityId: id.nullable(),
  feeType: key,
  label: text,
  category: z.enum([
    'authority',
    'government',
    'office',
    'visa_and_identity',
    'banking',
    'tax',
    'attestation',
    'professional_service',
  ]),
  sourceContext: text,
  recurrence: z.enum(['one_time', 'annual']),
  amountMinor: z.number().int().nonnegative().safe(),
  quantityBasis: z.enum(['flat', 'additional_shareholder', 'visa', 'office', 'add_on']),
  optionId: id.nullable(),
  timelineDays: range,
  documentKeys: z.array(id).max(20),
});

const catalogSchema = z
  .object({
    id,
    version: key,
    currency: z.literal('AED'),
    sourceState: z.enum(['ready', 'indicative-demo']),
    sourceLabel: text,
    sourceContext: text,
    jurisdictions: z
      .array(option.extend({ id: z.enum(['mainland', 'free_zone', 'offshore']) }))
      .min(1),
    authorities: z
      .array(
        option.extend({
          jurisdiction: z.enum(['mainland', 'free_zone', 'offshore']),
          emirate: key.nullable(),
          activityIds: z.array(id).min(1),
          legalStructureIds: z
            .array(z.enum(['llc', 'fz_llc', 'branch', 'offshore_company']))
            .min(1),
          officeTypeIds: z.array(z.enum(['none', 'flexi', 'physical', 'virtual'])).min(1),
          addOnIds: z.array(id),
          shareholderRange: range,
          visaRange: range,
        }),
      )
      .min(1),
    activities: z
      .array(
        option.extend({
          code: z.string().trim().min(1).max(40),
          category: text,
          jurisdictions: z.array(z.enum(['mainland', 'free_zone', 'offshore'])).min(1),
        }),
      )
      .min(1),
    legalStructures: z
      .array(option.extend({ id: z.enum(['llc', 'fz_llc', 'branch', 'offshore_company']) }))
      .min(1),
    officeTypes: z
      .array(option.extend({ id: z.enum(['none', 'flexi', 'physical', 'virtual']) }))
      .min(1),
    addOns: z.array(option),
    fees: z.array(fee),
    documents: z.array(option).min(1),
    assumptions: z.array(text).min(1),
    inclusions: z.array(text).min(1),
    exclusions: z.array(text).min(1),
  })
  .superRefine((catalog, context) => {
    for (const collection of [
      catalog.jurisdictions,
      catalog.authorities,
      catalog.activities,
      catalog.legalStructures,
      catalog.officeTypes,
      catalog.addOns,
      catalog.fees,
      catalog.documents,
    ]) {
      const ids = collection.map((item) => item.id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', message: 'Catalog IDs must be unique per collection.' });
      }
    }
    const activityIds = new Set(catalog.activities.map((item) => item.id));
    const addOnIds = new Set(catalog.addOns.map((item) => item.id));
    const documentIds = new Set(catalog.documents.map((item) => item.id));
    for (const authority of catalog.authorities) {
      if (
        authority.shareholderRange.min > authority.shareholderRange.max ||
        authority.visaRange.min > authority.visaRange.max
      ) {
        context.addIssue({ code: 'custom', message: 'Catalog ranges must be ordered.' });
      }
      if (authority.activityIds.some((value) => !activityIds.has(value))) {
        context.addIssue({ code: 'custom', message: 'Authority activity reference is invalid.' });
      }
      if (authority.addOnIds.some((value) => !addOnIds.has(value))) {
        context.addIssue({ code: 'custom', message: 'Authority add-on reference is invalid.' });
      }
    }
    const authorityIds = new Set(catalog.authorities.map((item) => item.id));
    for (const item of catalog.fees) {
      if (
        !authorityIds.has(item.authorityId) ||
        (item.activityId && !activityIds.has(item.activityId))
      ) {
        context.addIssue({ code: 'custom', message: 'Fee option reference is invalid.' });
      }
      if (
        item.optionId &&
        !addOnIds.has(item.optionId) &&
        !catalog.officeTypes.some((option) => option.id === item.optionId)
      ) {
        context.addIssue({ code: 'custom', message: 'Fee quantity option is invalid.' });
      }
      if (
        item.timelineDays.min > item.timelineDays.max ||
        item.documentKeys.some((key) => !documentIds.has(key))
      ) {
        context.addIssue({ code: 'custom', message: 'Fee metadata is invalid.' });
      }
    }
  });

export function validateEstimatorCatalog(input: unknown) {
  return catalogSchema.safeParse(input);
}

export function getPublicEstimatorSource(
  environment: 'development' | 'production' | 'test' = process.env.NODE_ENV,
  evidenceState?: 'unavailable' | 'error' | 'no-match',
): EstimatorSourceState {
  if (environment === 'production') {
    return { status: 'unavailable', retryable: false, reason: 'approved-catalog-required' };
  }
  if (evidenceState === 'unavailable') {
    return { status: 'unavailable', retryable: false, reason: 'approved-catalog-required' };
  }
  if (evidenceState === 'error') {
    return { status: 'error', retryable: false, reason: 'invalid-source' };
  }
  const candidate =
    evidenceState === 'no-match' ? { ...DEMO_ESTIMATOR_CATALOG, fees: [] } : DEMO_ESTIMATOR_CATALOG;
  const parsed = validateEstimatorCatalog(candidate);
  if (!parsed.success) return { status: 'error', retryable: false, reason: 'invalid-source' };
  return { status: 'indicative-demo', catalog: parsed.data as EstimatorCatalog };
}

export class UnsupportedEstimatorCombinationError extends Error {
  override name = 'UnsupportedEstimatorCombinationError';
}

export class NoMatchingEstimatorDataError extends Error {
  override name = 'NoMatchingEstimatorDataError';
}

export function calculateCatalogEstimate(
  catalog: EstimatorCatalog,
  draft: EstimatorDraft,
  now = new Date(),
): EstimatorResult {
  const source = validateEstimatorCatalog(catalog);
  if (!source.success && catalog.fees.length > 0) throw new Error('Estimator source is invalid.');
  const validation = validateEstimatorDraft(draft, catalog);
  if (!validation.valid)
    throw new UnsupportedEstimatorCombinationError('Review the highlighted selections.');
  const authority = getSelectedAuthority(draft, catalog);
  if (!authority) throw new UnsupportedEstimatorCombinationError('Choose an available authority.');

  const matched = catalog.fees.filter(
    (item) =>
      item.authorityId === authority.id &&
      (!item.activityId || item.activityId === draft.activityId),
  );
  const lineItems = matched.flatMap((item) => toLineItem(item, draft));
  if (
    !lineItems.some((item) => item.feeType === 'registration') ||
    !lineItems.some((item) => item.feeType === 'license')
  ) {
    throw new NoMatchingEstimatorDataError('No complete fee set matches this selection.');
  }
  if (
    draft.officeTypeId !== 'none' &&
    !lineItems.some((item) => item.feeType === `office_${draft.officeTypeId}`)
  ) {
    throw new NoMatchingEstimatorDataError('No matching office allowance is available.');
  }
  if (Number(draft.visaCount) > 0 && !lineItems.some((item) => item.feeType === 'visa')) {
    throw new NoMatchingEstimatorDataError('No matching visa allowance is available.');
  }

  const includedFees = matched.filter((feeItem) =>
    lineItems.some((line) => line.id === feeItem.id),
  );
  const oneTimeTotalMinor = sum(
    lineItems.filter((item) => item.recurrence === 'one_time').map((item) => item.totalMinor),
  );
  const annualTotalMinor = sum(
    lineItems.filter((item) => item.recurrence === 'annual').map((item) => item.totalMinor),
  );
  const normalizedDraft = { ...draft, addOnIds: [...draft.addOnIds].sort() };

  return {
    reference: estimatorReference(
      catalog.version,
      normalizedDraft,
      oneTimeTotalMinor,
      annualTotalMinor,
    ),
    catalogVersion: catalog.version,
    sourceState: catalog.sourceState,
    sourceLabel: catalog.sourceLabel,
    sourceContext: catalog.sourceContext,
    currency: 'AED',
    normalizedDraft,
    lineItems,
    oneTimeTotalMinor,
    annualTotalMinor,
    timelineDays: includedFees.length
      ? {
          min: sum(includedFees.map((item) => item.timelineDays.min)),
          max: sum(includedFees.map((item) => item.timelineDays.max)),
        }
      : null,
    requiredDocumentKeys: [...new Set(includedFees.flatMap((item) => item.documentKeys))].sort(),
    assumptions: catalog.assumptions,
    inclusions: catalog.inclusions,
    exclusions: catalog.exclusions,
    generatedAt: now.toISOString(),
  };
}

function toLineItem(item: EstimatorFee, draft: EstimatorDraft): EstimatorLineItem[] {
  const quantity =
    item.quantityBasis === 'flat'
      ? 1
      : item.quantityBasis === 'additional_shareholder'
        ? Math.max(0, Number(draft.shareholderCount) - 1)
        : item.quantityBasis === 'visa'
          ? Number(draft.visaCount)
          : item.quantityBasis === 'office'
            ? item.optionId === draft.officeTypeId
              ? 1
              : 0
            : item.optionId && draft.addOnIds.includes(item.optionId)
              ? 1
              : 0;
  if (quantity === 0) return [];
  return [
    {
      id: item.id,
      feeType: item.feeType,
      label: item.label,
      category: item.category,
      sourceContext: item.sourceContext,
      recurrence: item.recurrence,
      quantity,
      amountMinor: item.amountMinor,
      totalMinor: item.amountMinor * quantity,
    },
  ];
}

function estimatorReference(
  version: string,
  draft: EstimatorDraft,
  oneTimeTotalMinor: number,
  annualTotalMinor: number,
) {
  const value = JSON.stringify({ version, draft, oneTimeTotalMinor, annualTotalMinor });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `EST-DEMO-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
