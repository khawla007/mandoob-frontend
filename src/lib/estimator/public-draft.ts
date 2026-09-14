import type { Jurisdiction } from './calculate';
import type {
  EstimatorCatalog,
  EstimatorDraft,
  EstimatorResult,
  EstimatorValidationError,
} from './public-contracts';

export const ESTIMATOR_STEPS = [
  'Jurisdiction',
  'Authority',
  'Business activity',
  'Legal structure',
  'Shareholders',
  'Visas',
  'Office',
  'Add-ons',
  'Summary',
] as const;

export const EMPTY_ESTIMATOR_DRAFT: EstimatorDraft = {
  jurisdiction: null,
  authorityId: null,
  activityId: null,
  legalStructureId: null,
  shareholderCount: '',
  visaCount: '',
  officeTypeId: null,
  addOnIds: [],
};

export type EstimatorDraftField = keyof EstimatorDraft;

export function applyDraftChange(
  draft: EstimatorDraft,
  field: EstimatorDraftField,
  value: EstimatorDraft[EstimatorDraftField],
  catalog: EstimatorCatalog,
): EstimatorDraft {
  if (field === 'jurisdiction') {
    const jurisdiction = value as EstimatorDraft['jurisdiction'];
    return {
      ...draft,
      jurisdiction,
      authorityId: null,
      activityId: null,
      legalStructureId: null,
      visaCount: jurisdiction === 'offshore' ? '0' : draft.visaCount,
      officeTypeId: null,
      addOnIds: [],
    };
  }

  if (field === 'authorityId') {
    const requested = value as string | null;
    const authority = catalog.authorities.find(
      (candidate) => candidate.id === requested && candidate.jurisdiction === draft.jurisdiction,
    );
    return {
      ...draft,
      authorityId: authority?.id ?? null,
      activityId: null,
      legalStructureId: null,
      visaCount:
        !authority || draft.visaCount === ''
          ? draft.visaCount
          : parseInteger(draft.visaCount) !== null &&
              parseInteger(draft.visaCount)! >= authority.visaRange.min &&
              parseInteger(draft.visaCount)! <= authority.visaRange.max
            ? draft.visaCount
            : '',
      officeTypeId: null,
      addOnIds: [],
    };
  }

  const next = { ...draft, [field]: value } as EstimatorDraft;
  const authority = getSelectedAuthority(next, catalog);
  if (!authority) return next;

  if (
    field === 'activityId' &&
    next.activityId &&
    !authority.activityIds.includes(next.activityId)
  ) {
    next.activityId = null;
  }
  if (
    field === 'legalStructureId' &&
    next.legalStructureId &&
    !authority.legalStructureIds.includes(next.legalStructureId)
  ) {
    next.legalStructureId = null;
  }
  if (
    field === 'officeTypeId' &&
    next.officeTypeId &&
    !authority.officeTypeIds.includes(next.officeTypeId)
  ) {
    next.officeTypeId = null;
  }
  if (field === 'addOnIds') {
    next.addOnIds = (value as string[]).filter((id) => authority.addOnIds.includes(id));
  }
  if (field === 'visaCount') {
    next.officeTypeId = null;
  }
  return next;
}

export function validateEstimatorDraft(
  draft: EstimatorDraft,
  catalog: EstimatorCatalog,
): { valid: boolean; errors: EstimatorValidationError[] } {
  const errors: EstimatorValidationError[] = [];
  const add = (step: number, fieldId: string, message: string) =>
    errors.push({ step, fieldId, message });

  if (
    !draft.jurisdiction ||
    !catalog.jurisdictions.some((item) => item.id === draft.jurisdiction)
  ) {
    add(1, 'estimate-jurisdiction', 'Choose a jurisdiction.');
  }

  const authority = getSelectedAuthority(draft, catalog);
  if (!authority) add(2, 'estimate-authority', 'Choose an available authority.');

  if (!draft.activityId || !authority?.activityIds.includes(draft.activityId)) {
    add(3, 'estimate-activity', 'Choose an available business activity.');
  }
  if (!draft.legalStructureId || !authority?.legalStructureIds.includes(draft.legalStructureId)) {
    add(4, 'estimate-legal-structure', 'Choose a compatible legal structure.');
  }

  const shareholders = parseInteger(draft.shareholderCount);
  if (
    shareholders === null ||
    !authority ||
    shareholders < authority.shareholderRange.min ||
    shareholders > authority.shareholderRange.max
  ) {
    add(
      5,
      'estimate-shareholders',
      authority
        ? `Enter a whole number from ${authority.shareholderRange.min} to ${authority.shareholderRange.max}.`
        : 'Enter a valid whole number after choosing an authority.',
    );
  }

  const visas = parseInteger(draft.visaCount);
  if (
    visas === null ||
    !authority ||
    visas < authority.visaRange.min ||
    visas > authority.visaRange.max
  ) {
    add(
      6,
      'estimate-visas',
      authority
        ? `Enter a whole number from ${authority.visaRange.min} to ${authority.visaRange.max}.`
        : 'Enter a valid whole number after choosing an authority.',
    );
  }

  if (!draft.officeTypeId || !authority?.officeTypeIds.includes(draft.officeTypeId)) {
    add(7, 'estimate-office', 'Choose a compatible office option.');
  }
  if (draft.addOnIds.some((id) => !authority?.addOnIds.includes(id))) {
    add(8, 'estimate-addons', 'Review the selected optional services.');
  }

  return { valid: errors.length === 0, errors };
}

export function getEstimatorResumeStep(draft: EstimatorDraft, catalog: EstimatorCatalog): number {
  const validation = validateEstimatorDraft(draft, catalog);
  return validation.valid ? 9 : (validation.errors[0]?.step ?? 1);
}

export function getSelectedAuthority(draft: EstimatorDraft, catalog: EstimatorCatalog) {
  return catalog.authorities.find(
    (authority) =>
      authority.id === draft.authorityId && authority.jurisdiction === draft.jurisdiction,
  );
}

export function parseEstimatorPrefill(
  search: Record<string, string | string[] | undefined>,
  catalog: EstimatorCatalog,
): Partial<EstimatorDraft> {
  const jurisdictionRaw = singleSafeValue(search.jurisdiction, 64);
  const vehicleRaw = singleSafeValue(search.vehicle, 64);
  const legacy: Record<string, Jurisdiction> = {
    mainland: 'mainland',
    'free-zone': 'free_zone',
    offshore: 'offshore',
  };
  const jurisdiction = catalog.jurisdictions.some((item) => item.id === jurisdictionRaw)
    ? (jurisdictionRaw as Jurisdiction)
    : vehicleRaw
      ? legacy[vehicleRaw]
      : undefined;
  if (!jurisdiction) return {};

  const prefill: Partial<EstimatorDraft> = { jurisdiction };
  const authorityRaw = singleSafeValue(search.authority, 120);
  if (!authorityRaw) return prefill;
  const authority = catalog.authorities.find(
    (candidate) =>
      candidate.jurisdiction === jurisdiction &&
      (candidate.id.toLowerCase() === authorityRaw.toLowerCase() ||
        candidate.label.toLowerCase() === authorityRaw.toLowerCase()),
  );
  if (!authority) return prefill;

  const emirateRaw = singleSafeValue(search.emirate, 80);
  if (emirateRaw && emirateRaw !== authority.emirate) return prefill;
  prefill.authorityId = authority.id;
  return prefill;
}

export function buildEstimatorApplyHref(result: EstimatorResult): string {
  const draft = result.normalizedDraft;
  const params = new URLSearchParams({
    estimate_ref: result.reference,
    jurisdiction: draft.jurisdiction ?? '',
    authority: draft.authorityId ?? '',
    activity: draft.activityId ?? '',
    shareholders: draft.shareholderCount,
    visas: draft.visaCount,
    legal_structure: draft.legalStructureId ?? '',
    office_type: draft.officeTypeId ?? '',
  });
  if (draft.addOnIds.length > 0) params.set('addons', draft.addOnIds.join(','));
  return `/apply?${params.toString()}`;
}

function parseInteger(value: string): number | null {
  if (!/^(0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function singleSafeValue(value: string | string[] | undefined, max: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) return undefined;
  if (!/^[A-Za-z0-9 _-]+$/u.test(value)) return undefined;
  return value;
}
