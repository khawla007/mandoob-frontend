import type { EstimatorCatalog, EstimatorDraft } from './public-contracts';
import { getSelectedAuthority } from './public-draft';

export const ESTIMATOR_DRAFT_STORAGE_KEY = 'mandoob.estimator.draft';
export const ESTIMATOR_DRAFT_SCHEMA_VERSION = 1;
export const ESTIMATOR_DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SavedEstimatorDraftResult =
  | { status: 'ready'; draft: EstimatorDraft; savedAt: string }
  | { status: 'corrupt' | 'expired' | 'incompatible' };

export function serializeEstimatorDraft(
  draft: EstimatorDraft,
  catalogVersion: string,
  now = new Date(),
) {
  return JSON.stringify({
    schemaVersion: ESTIMATOR_DRAFT_SCHEMA_VERSION,
    catalogVersion,
    savedAt: now.toISOString(),
    draft,
  });
}

export function parseSavedEstimatorDraft(
  raw: string,
  catalog: EstimatorCatalog,
  now = new Date(),
): SavedEstimatorDraftResult {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { status: 'corrupt' };
  }
  if (!payload || typeof payload !== 'object') return { status: 'corrupt' };
  const candidate = payload as Record<string, unknown>;
  if (
    candidate.schemaVersion !== ESTIMATOR_DRAFT_SCHEMA_VERSION ||
    candidate.catalogVersion !== catalog.version
  ) {
    return { status: 'incompatible' };
  }
  if (typeof candidate.savedAt !== 'string') return { status: 'corrupt' };
  const savedAt = new Date(candidate.savedAt);
  if (
    Number.isNaN(savedAt.getTime()) ||
    savedAt.getTime() > now.getTime() + 60_000 ||
    now.getTime() - savedAt.getTime() > ESTIMATOR_DRAFT_RETENTION_MS
  ) {
    return { status: 'expired' };
  }
  if (!isDraft(candidate.draft) || !isCompatible(candidate.draft, catalog)) {
    return { status: 'corrupt' };
  }
  return { status: 'ready', draft: candidate.draft, savedAt: savedAt.toISOString() };
}

function isDraft(value: unknown): value is EstimatorDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return (
    (draft.jurisdiction === null ||
      ['mainland', 'free_zone', 'offshore'].includes(String(draft.jurisdiction))) &&
    (draft.authorityId === null || typeof draft.authorityId === 'string') &&
    (draft.activityId === null || typeof draft.activityId === 'string') &&
    (draft.legalStructureId === null ||
      ['llc', 'fz_llc', 'branch', 'offshore_company'].includes(String(draft.legalStructureId))) &&
    typeof draft.shareholderCount === 'string' &&
    typeof draft.visaCount === 'string' &&
    (draft.officeTypeId === null ||
      ['none', 'flexi', 'physical', 'virtual'].includes(String(draft.officeTypeId))) &&
    Array.isArray(draft.addOnIds) &&
    draft.addOnIds.every((item) => typeof item === 'string')
  );
}

function isCompatible(draft: EstimatorDraft, catalog: EstimatorCatalog) {
  if (draft.jurisdiction && !catalog.jurisdictions.some((item) => item.id === draft.jurisdiction))
    return false;
  if (!draft.authorityId)
    return (
      !draft.activityId &&
      !draft.legalStructureId &&
      !draft.officeTypeId &&
      draft.addOnIds.length === 0
    );
  const authority = getSelectedAuthority(draft, catalog);
  if (!authority) return false;
  if (draft.activityId && !authority.activityIds.includes(draft.activityId)) return false;
  if (draft.legalStructureId && !authority.legalStructureIds.includes(draft.legalStructureId))
    return false;
  if (draft.officeTypeId && !authority.officeTypeIds.includes(draft.officeTypeId)) return false;
  if (draft.addOnIds.some((item) => !authority.addOnIds.includes(item))) return false;
  return [draft.shareholderCount, draft.visaCount].every(
    (item) => item === '' || /^(0|[1-9]\d*)$/u.test(item),
  );
}
