import type {
  ApplicationDefinition,
  ApplicationDraft,
  ApplicationDraftEnvelope,
} from './contracts';

export const APPLICATION_STORAGE_SCHEMA_VERSION = 1 as const;
export const APPLICATION_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const APPLICATION_LOCAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const APPLICATION_STORAGE_MAX_BYTES = 100_000;

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type DraftStorageTier = 'session' | 'local';

export type SaveApplicationDraftResult =
  | { status: 'saved'; savedAt: string; expiresAt: string }
  | { status: 'conflict'; storedSavedAt: string | null }
  | { status: 'invalid-draft' | 'too-large' | 'unavailable' };

export type LoadApplicationDraftResult =
  | { status: 'empty' }
  | { status: 'loaded'; draft: ApplicationDraft; savedAt: string; expiresAt: string }
  | { status: 'conflict'; storedSavedAt: string }
  | {
      status: 'discarded';
      reason:
        | 'corrupt'
        | 'expired'
        | 'future-timestamp'
        | 'schema-mismatch'
        | 'definition-mismatch'
        | 'storage-mismatch'
        | 'unknown-fields'
        | 'invalid-draft'
        | 'too-large';
      cleared: boolean;
    }
  | { status: 'unavailable' };

type SaveApplicationDraftInput = {
  storage: DraftStorage;
  key: string;
  tier: DraftStorageTier;
  draft: ApplicationDraft;
  definition: ApplicationDefinition;
  now?: Date;
  expectedSavedAt?: string | null;
};

type LoadApplicationDraftInput = {
  storage: DraftStorage;
  key: string;
  tier: DraftStorageTier;
  definition: ApplicationDefinition;
  now?: Date;
  newerInMemorySavedAt?: string | null;
};

const ENVELOPE_KEYS = [
  'schemaVersion',
  'definitionVersion',
  'savedAt',
  'expiresAt',
  'storage',
  'draft',
] as const;

export function saveApplicationDraft({
  storage,
  key,
  tier,
  draft,
  definition,
  now = new Date(),
  expectedSavedAt,
}: SaveApplicationDraftInput): SaveApplicationDraftResult {
  if (!isValidApplicationDraft(draft, definition)) return { status: 'invalid-draft' };

  const savedAt = now.toISOString();
  const retention =
    tier === 'local' ? APPLICATION_LOCAL_RETENTION_MS : APPLICATION_SESSION_RETENTION_MS;
  const expiresAt = new Date(now.getTime() + retention).toISOString();
  const envelope: ApplicationDraftEnvelope = {
    schemaVersion: APPLICATION_STORAGE_SCHEMA_VERSION,
    definitionVersion: definition.version,
    savedAt,
    expiresAt,
    storage: tier,
    draft: snapshotApplicationDraft(draft),
  };

  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    return { status: 'invalid-draft' };
  }
  if (serializedByteLength(serialized) > APPLICATION_STORAGE_MAX_BYTES) {
    return { status: 'too-large' };
  }
  if (!isSerializedEnvelopeValid(serialized, envelope, definition)) {
    return { status: 'invalid-draft' };
  }

  try {
    if (expectedSavedAt !== undefined) {
      const current = storage.getItem(key);
      if (current !== null) {
        const storedSavedAt = readComparableSavedAt(current, tier, definition, now);
        if (storedSavedAt === null || storedSavedAt !== expectedSavedAt) {
          return { status: 'conflict', storedSavedAt };
        }
      } else if (expectedSavedAt !== null) {
        return { status: 'conflict', storedSavedAt: null };
      }
    }
    storage.setItem(key, serialized);
    return { status: 'saved', savedAt, expiresAt };
  } catch {
    return { status: 'unavailable' };
  }
}

export function loadApplicationDraft({
  storage,
  key,
  tier,
  definition,
  now = new Date(),
  newerInMemorySavedAt,
}: LoadApplicationDraftInput): LoadApplicationDraftResult {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: 'unavailable' };
  }
  if (raw === null) return { status: 'empty' };
  if (serializedByteLength(raw) > APPLICATION_STORAGE_MAX_BYTES) {
    return discard(storage, key, 'too-large');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return discard(storage, key, 'corrupt');
  }
  if (!isRecord(parsed)) return discard(storage, key, 'corrupt');
  if (!hasExactKeys(parsed, ENVELOPE_KEYS)) return discard(storage, key, 'unknown-fields');
  if (parsed.schemaVersion !== APPLICATION_STORAGE_SCHEMA_VERSION) {
    return discard(storage, key, 'schema-mismatch');
  }
  if (parsed.definitionVersion !== definition.version) {
    return discard(storage, key, 'definition-mismatch');
  }
  if (parsed.storage !== tier) return discard(storage, key, 'storage-mismatch');
  if (
    typeof parsed.savedAt !== 'string' ||
    typeof parsed.expiresAt !== 'string' ||
    !isExactIsoDate(parsed.savedAt) ||
    !isExactIsoDate(parsed.expiresAt)
  ) {
    return discard(storage, key, 'corrupt');
  }

  const savedTime = Date.parse(parsed.savedAt);
  const expiresTime = Date.parse(parsed.expiresAt);
  const nowTime = now.getTime();
  if (savedTime > nowTime + 30_000) {
    return discard(storage, key, 'future-timestamp');
  }
  if (expiresTime <= nowTime) {
    return discard(storage, key, 'expired');
  }
  if (expiresTime <= savedTime || expiresTime - savedTime > retentionFor(tier)) {
    return discard(storage, key, 'future-timestamp');
  }
  if (!isRecord(parsed.draft)) return discard(storage, key, 'invalid-draft');
  if (!hasExactDraftShape(parsed.draft)) return discard(storage, key, 'unknown-fields');
  if (!isValidApplicationDraft(parsed.draft, definition)) {
    return discard(storage, key, 'invalid-draft');
  }
  if (
    parsed.draft.confirmations.informationIsTrue ||
    parsed.draft.confirmations.dataProcessingConsent
  ) {
    return discard(storage, key, 'invalid-draft');
  }
  if (
    newerInMemorySavedAt &&
    isExactIsoDate(newerInMemorySavedAt) &&
    Date.parse(newerInMemorySavedAt) > savedTime
  ) {
    return { status: 'conflict', storedSavedAt: parsed.savedAt };
  }

  return {
    status: 'loaded',
    draft: parsed.draft,
    savedAt: parsed.savedAt,
    expiresAt: parsed.expiresAt,
  };
}

export function clearApplicationDraft(
  storage: DraftStorage,
  key: string,
): { status: 'cleared' | 'unavailable' } {
  try {
    storage.removeItem(key);
    return { status: 'cleared' };
  } catch {
    return { status: 'unavailable' };
  }
}

export function resetApplicationDraft(
  storage: DraftStorage,
  key: string,
): { status: 'cleared' | 'unavailable' } {
  return clearApplicationDraft(storage, key);
}

function discard(
  storage: DraftStorage,
  key: string,
  reason: Extract<LoadApplicationDraftResult, { status: 'discarded' }>['reason'],
): LoadApplicationDraftResult {
  return {
    status: 'discarded',
    reason,
    cleared: clearApplicationDraft(storage, key).status === 'cleared',
  };
}

function retentionFor(tier: DraftStorageTier) {
  return tier === 'local' ? APPLICATION_LOCAL_RETENTION_MS : APPLICATION_SESSION_RETENTION_MS;
}

function serializedByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function readComparableSavedAt(
  raw: string,
  tier: DraftStorageTier,
  definition: ApplicationDefinition,
  now: Date,
): string | null {
  if (serializedByteLength(raw) > APPLICATION_STORAGE_MAX_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      !hasExactKeys(parsed, ENVELOPE_KEYS) ||
      parsed.schemaVersion !== APPLICATION_STORAGE_SCHEMA_VERSION ||
      parsed.definitionVersion !== definition.version ||
      parsed.storage !== tier ||
      typeof parsed.savedAt !== 'string' ||
      typeof parsed.expiresAt !== 'string' ||
      !isExactIsoDate(parsed.savedAt) ||
      !isExactIsoDate(parsed.expiresAt) ||
      !isValidApplicationDraft(parsed.draft, definition) ||
      parsed.draft.confirmations.informationIsTrue ||
      parsed.draft.confirmations.dataProcessingConsent
    ) {
      return null;
    }
    const savedTime = Date.parse(parsed.savedAt);
    const expiresTime = Date.parse(parsed.expiresAt);
    if (
      savedTime > now.getTime() + 30_000 ||
      expiresTime <= now.getTime() ||
      expiresTime <= savedTime ||
      expiresTime - savedTime > retentionFor(tier)
    ) {
      return null;
    }
    return parsed.savedAt;
  } catch {
    return null;
  }
}

function snapshotApplicationDraft(draft: ApplicationDraft): ApplicationDraft {
  return {
    contact: {
      fullName: draft.contact.fullName,
      nationality: draft.contact.nationality,
      email: draft.contact.email,
      phone: draft.contact.phone,
    },
    business: {
      activityId: draft.business.activityId,
      preferredNames: [
        draft.business.preferredNames[0],
        draft.business.preferredNames[1],
        draft.business.preferredNames[2],
      ],
      summary: draft.business.summary,
    },
    setup: {
      jurisdiction: draft.setup.jurisdiction,
      authorityId: draft.setup.authorityId,
      legalStructureId: draft.setup.legalStructureId,
      officeTypeId: draft.setup.officeTypeId,
      officeNotes: draft.setup.officeNotes,
      addOnIds: draft.setup.addOnIds.map((id) => id),
    },
    visas: {
      required: draft.visas.required,
      investorCount: draft.visas.investorCount,
      employeeCount: draft.visas.employeeCount,
      familyCount: draft.visas.familyCount,
      estimatorTotalSuggestion: draft.visas.estimatorTotalSuggestion,
    },
    shareholders: draft.shareholders.map((shareholder) => ({
      id: shareholder.id,
      kind: 'individual',
      fullName: shareholder.fullName,
      nationality: shareholder.nationality,
      ownershipBasisPoints: shareholder.ownershipBasisPoints,
    })),
    documentReadiness: Object.fromEntries(
      Object.entries(draft.documentReadiness).map(([id, readiness]) => [id, readiness]),
    ),
    confirmations: { informationIsTrue: false, dataProcessingConsent: false },
  };
}

function isSerializedEnvelopeValid(
  serialized: string,
  expected: ApplicationDraftEnvelope,
  definition: ApplicationDefinition,
) {
  try {
    const parsed: unknown = JSON.parse(serialized);
    return (
      isRecord(parsed) &&
      hasExactKeys(parsed, ENVELOPE_KEYS) &&
      parsed.schemaVersion === expected.schemaVersion &&
      parsed.definitionVersion === expected.definitionVersion &&
      parsed.savedAt === expected.savedAt &&
      parsed.expiresAt === expected.expiresAt &&
      parsed.storage === expected.storage &&
      isValidApplicationDraft(parsed.draft, definition) &&
      parsed.draft.confirmations.informationIsTrue === false &&
      parsed.draft.confirmations.dataProcessingConsent === false
    );
  } catch {
    return false;
  }
}

function isExactIsoDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function stringsWithin(values: unknown, max: number, length?: number): values is string[] {
  return (
    Array.isArray(values) &&
    (length === undefined || values.length === length) &&
    values.every((value) => typeof value === 'string' && value.length <= max)
  );
}

function hasExactDraftShape(draft: Record<string, unknown>) {
  const draftKeys = [
    'contact',
    'business',
    'setup',
    'visas',
    'shareholders',
    'documentReadiness',
    'confirmations',
  ];
  if (!hasExactKeys(draft, draftKeys)) return false;
  if (
    !isRecord(draft.contact) ||
    !hasExactKeys(draft.contact, ['fullName', 'nationality', 'email', 'phone'])
  )
    return false;
  if (
    !isRecord(draft.business) ||
    !hasExactKeys(draft.business, ['activityId', 'preferredNames', 'summary'])
  )
    return false;
  if (
    !isRecord(draft.setup) ||
    !hasExactKeys(draft.setup, [
      'jurisdiction',
      'authorityId',
      'legalStructureId',
      'officeTypeId',
      'officeNotes',
      'addOnIds',
    ])
  )
    return false;
  if (
    !isRecord(draft.visas) ||
    !hasExactKeys(draft.visas, [
      'required',
      'investorCount',
      'employeeCount',
      'familyCount',
      'estimatorTotalSuggestion',
    ])
  )
    return false;
  if (
    !isRecord(draft.documentReadiness) ||
    !isRecord(draft.confirmations) ||
    !hasExactKeys(draft.confirmations, ['informationIsTrue', 'dataProcessingConsent'])
  )
    return false;
  if (!Array.isArray(draft.shareholders)) return false;
  return draft.shareholders.every(
    (row) =>
      isRecord(row) &&
      hasExactKeys(row, ['id', 'kind', 'fullName', 'nationality', 'ownershipBasisPoints']),
  );
}

function isValidApplicationDraft(
  value: unknown,
  definition: ApplicationDefinition,
): value is ApplicationDraft {
  if (!isRecord(value) || !hasExactDraftShape(value)) return false;
  const { contact, business, setup, visas, shareholders, documentReadiness, confirmations } = value;
  if (
    !isRecord(contact) ||
    !isRecord(business) ||
    !isRecord(setup) ||
    !isRecord(visas) ||
    !isRecord(documentReadiness) ||
    !isRecord(confirmations) ||
    !Array.isArray(shareholders)
  )
    return false;

  if (
    typeof contact.fullName !== 'string' ||
    contact.fullName.length > definition.limits.nameMax ||
    typeof contact.nationality !== 'string' ||
    contact.nationality.length > definition.limits.nameMax ||
    typeof contact.email !== 'string' ||
    contact.email.length > definition.limits.emailMax ||
    typeof contact.phone !== 'string' ||
    contact.phone.length > definition.limits.phoneMax
  )
    return false;
  if (
    !(
      business.activityId === null ||
      definition.activities.some(({ id }) => id === business.activityId)
    ) ||
    !stringsWithin(business.preferredNames, definition.limits.companyNameMax, 3) ||
    typeof business.summary !== 'string' ||
    business.summary.length > definition.limits.businessSummaryMax
  )
    return false;

  const allowed = <T extends { id: string }>(items: ReadonlyArray<T>, selected: unknown) =>
    selected === null || (typeof selected === 'string' && items.some(({ id }) => id === selected));
  if (
    !allowed(definition.jurisdictions, setup.jurisdiction) ||
    !allowed(definition.authorities, setup.authorityId) ||
    !allowed(definition.legalStructures, setup.legalStructureId) ||
    !allowed(definition.officeTypes, setup.officeTypeId) ||
    typeof setup.officeNotes !== 'string' ||
    setup.officeNotes.length > definition.limits.officeNotesMax ||
    !stringsWithin(setup.addOnIds, 100) ||
    !setup.addOnIds.every((id) => definition.addOns.some((item) => item.id === id)) ||
    new Set(setup.addOnIds).size !== setup.addOnIds.length
  )
    return false;
  const estimatorSuggestion = visas.estimatorTotalSuggestion;
  if (
    !(visas.required === null || typeof visas.required === 'boolean') ||
    !['investorCount', 'employeeCount', 'familyCount'].every(
      (key) => typeof visas[key] === 'string' && visas[key].length <= 12,
    ) ||
    !(
      estimatorSuggestion === null ||
      (typeof estimatorSuggestion === 'number' &&
        Number.isInteger(estimatorSuggestion) &&
        estimatorSuggestion >= 0)
    )
  )
    return false;

  const shareholderIds = new Set<string>();
  for (const shareholder of shareholders) {
    if (
      !isRecord(shareholder) ||
      typeof shareholder.id !== 'string' ||
      !/^shareholder-[1-9]\d*$/.test(shareholder.id) ||
      shareholderIds.has(shareholder.id) ||
      shareholder.kind !== 'individual' ||
      typeof shareholder.fullName !== 'string' ||
      shareholder.fullName.length > definition.limits.nameMax ||
      typeof shareholder.nationality !== 'string' ||
      shareholder.nationality.length > definition.limits.nameMax ||
      typeof shareholder.ownershipBasisPoints !== 'string' ||
      shareholder.ownershipBasisPoints.length > 10
    )
      return false;
    shareholderIds.add(shareholder.id);
  }
  if (shareholders.length === 0) return false;

  const allowedDocumentKeys = new Set<string>();
  for (const rule of definition.documentRules) {
    if (rule.owner === 'contact') allowedDocumentKeys.add(`${rule.documentId}:contact`);
    if (rule.owner === 'business') allowedDocumentKeys.add(`${rule.documentId}:business`);
    if (rule.owner === 'each-shareholder') {
      for (const id of shareholderIds) allowedDocumentKeys.add(`${rule.documentId}:${id}`);
    }
  }
  if (
    !Object.entries(documentReadiness).every(
      ([key, state]) =>
        allowedDocumentKeys.has(key) && (state === 'ready' || state === 'not-ready'),
    )
  )
    return false;
  return (
    typeof confirmations.informationIsTrue === 'boolean' &&
    typeof confirmations.dataProcessingConsent === 'boolean'
  );
}
