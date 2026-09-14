import type {
  ApplicationDefinition,
  EstimatorApplicationHandoff,
  EstimatorHandoffResult,
} from './contracts';

const REQUIRED_KEYS = [
  'estimate_ref',
  'jurisdiction',
  'authority',
  'activity',
  'shareholders',
  'visas',
  'legal_structure',
  'office_type',
] as const;
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, 'addons']);
const SAFE_VALUE = /^[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*$/u;

export function parseEstimatorApplicationHandoff(
  params: URLSearchParams,
  definition: ApplicationDefinition,
): EstimatorHandoffResult {
  const reject = (): EstimatorHandoffResult => ({
    status: 'rejected',
    reason: 'invalid-estimator-handoff',
  });
  const keys = [...params.keys()];
  if (keys.some((key) => !ALLOWED_KEYS.has(key))) return reject();
  for (const key of new Set(keys)) {
    if (params.getAll(key).length !== 1) return reject();
    const value = params.get(key) ?? '';
    if (!value || value.length > 120 || !SAFE_VALUE.test(value)) return reject();
  }
  if (REQUIRED_KEYS.some((key) => !params.has(key))) return reject();

  const reference = params.get('estimate_ref')!;
  if (!/^EST-DEMO-[A-Z0-9]{7}$/u.test(reference)) return reject();
  const jurisdiction = params.get('jurisdiction')!;
  const authorityId = params.get('authority')!;
  const activityId = params.get('activity')!;
  const legalStructureId = params.get('legal_structure')!;
  const officeTypeId = params.get('office_type')!;
  const shareholderCount = parseInteger(params.get('shareholders')!);
  const visaTotalSuggestion = parseInteger(params.get('visas')!);
  const authority = definition.authorities.find(
    (item) => item.id === authorityId && item.jurisdiction === jurisdiction,
  );
  if (
    !authority ||
    !definition.jurisdictions.some((item) => item.id === jurisdiction) ||
    !authority.activityIds.includes(activityId) ||
    !authority.legalStructureIds.includes(legalStructureId as never) ||
    !authority.officeTypeIds.includes(officeTypeId as never) ||
    shareholderCount === null ||
    shareholderCount < authority.shareholderRange.min ||
    shareholderCount > authority.shareholderRange.max ||
    visaTotalSuggestion === null ||
    visaTotalSuggestion < authority.visaRange.min ||
    visaTotalSuggestion > authority.visaRange.max
  )
    return reject();

  const addOnIds = params.has('addons') ? params.get('addons')!.split(',') : [];
  if (
    new Set(addOnIds).size !== addOnIds.length ||
    addOnIds.some((id) => !authority.addOnIds.includes(id))
  )
    return reject();
  return {
    status: 'accepted',
    value: {
      reference,
      jurisdiction: jurisdiction as EstimatorApplicationHandoff['jurisdiction'],
      authorityId,
      activityId,
      shareholderCount,
      visaTotalSuggestion,
      legalStructureId: legalStructureId as EstimatorApplicationHandoff['legalStructureId'],
      officeTypeId: officeTypeId as EstimatorApplicationHandoff['officeTypeId'],
      addOnIds,
    },
  };
}

function parseInteger(value: string) {
  if (!/^(0|[1-9]\d*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
