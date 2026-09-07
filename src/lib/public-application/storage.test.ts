import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPLICATION_DEFINITION, EMPTY_APPLICATION_DRAFT } from './definition';
import {
  APPLICATION_LOCAL_RETENTION_MS,
  APPLICATION_SESSION_RETENTION_MS,
  APPLICATION_STORAGE_SCHEMA_VERSION,
  clearApplicationDraft,
  loadApplicationDraft,
  resetApplicationDraft,
  saveApplicationDraft,
  type DraftStorage,
} from './storage';

class MemoryStorage implements DraftStorage {
  readonly values = new Map<string, string>();
  fail: 'get' | 'set' | 'remove' | null = null;

  getItem(key: string) {
    if (this.fail === 'get') throw new Error('denied');
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.fail === 'set') throw new Error('denied');
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (this.fail === 'remove') throw new Error('denied');
    this.values.delete(key);
  }
}

const now = new Date('2026-09-07T10:00:00.000Z');
const key = 'mandoob:application:test';

function completeDraft() {
  return {
    ...structuredClone(EMPTY_APPLICATION_DRAFT),
    contact: {
      fullName: 'Example Person',
      nationality: 'AE',
      email: 'person@example.test',
      phone: '',
    },
    documentReadiness: {
      'passport-copy:contact': 'ready' as const,
      'passport-copy:shareholder-1': 'not-ready' as const,
      'activity-summary:business': 'ready' as const,
    },
  };
}

test('session autosave creates a versioned, definition-bound envelope with sensible retention', () => {
  const storage = new MemoryStorage();
  const result = saveApplicationDraft({
    storage,
    key,
    tier: 'session',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });

  assert.equal(result.status, 'saved');
  if (result.status !== 'saved') return;
  const envelope = JSON.parse(storage.getItem(key)!);
  assert.equal(envelope.schemaVersion, APPLICATION_STORAGE_SCHEMA_VERSION);
  assert.equal(envelope.definitionVersion, APPLICATION_DEFINITION.version);
  assert.equal(envelope.storage, 'session');
  assert.equal(envelope.savedAt, now.toISOString());
  assert.equal(
    envelope.expiresAt,
    new Date(now.getTime() + APPLICATION_SESSION_RETENTION_MS).toISOString(),
  );
  assert.equal(result.savedAt, now.toISOString());
});

test('explicit local save never retains longer than seven days', () => {
  const storage = new MemoryStorage();
  const result = saveApplicationDraft({
    storage,
    key,
    tier: 'local',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });

  assert.equal(result.status, 'saved');
  const envelope = JSON.parse(storage.getItem(key)!);
  assert.equal(envelope.storage, 'local');
  assert.equal(
    new Date(envelope.expiresAt).getTime() - now.getTime(),
    APPLICATION_LOCAL_RETENTION_MS,
  );
  assert.ok(APPLICATION_LOCAL_RETENTION_MS <= 7 * 24 * 60 * 60 * 1000);
});

test('loads a valid allowlisted draft without adding persisted metadata', () => {
  const storage = new MemoryStorage();
  saveApplicationDraft({
    storage,
    key,
    tier: 'local',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });

  const loaded = loadApplicationDraft({
    storage,
    key,
    tier: 'local',
    definition: APPLICATION_DEFINITION,
    now: new Date(now.getTime() + 1),
  });
  assert.equal(loaded.status, 'loaded');
  if (loaded.status === 'loaded') {
    assert.deepEqual(loaded.draft, completeDraft());
    assert.equal(loaded.savedAt, now.toISOString());
  }
  assert.doesNotMatch(storage.getItem(key)!, /file(name|type|size)|objectURL|bytes/i);
});

test('rejects and clears corrupt, expired, future, schema, definition and unknown-field envelopes', () => {
  const validStorage = new MemoryStorage();
  saveApplicationDraft({
    storage: validStorage,
    key,
    tier: 'local',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });
  const valid = JSON.parse(validStorage.getItem(key)!);
  const cases: Array<[string, unknown, string]> = [
    ['corrupt', '{broken', 'corrupt'],
    ['expired', { ...valid, expiresAt: now.toISOString() }, 'expired'],
    [
      'future',
      { ...valid, savedAt: new Date(now.getTime() + 60_001).toISOString() },
      'future-timestamp',
    ],
    ['schema', { ...valid, schemaVersion: 2 }, 'schema-mismatch'],
    ['definition', { ...valid, definitionVersion: 'future' }, 'definition-mismatch'],
    ['unknown-envelope', { ...valid, surprise: true }, 'unknown-fields'],
    [
      'unknown-draft',
      { ...valid, draft: { ...valid.draft, uploadFilename: 'secret.pdf' } },
      'unknown-fields',
    ],
  ];

  for (const [, raw, reason] of cases) {
    const storage = new MemoryStorage();
    storage.setItem(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
    const result = loadApplicationDraft({
      storage,
      key,
      tier: 'local',
      definition: APPLICATION_DEFINITION,
      now: new Date(now.getTime() + 1),
    });
    assert.deepEqual(result, { status: 'discarded', reason, cleared: true });
    assert.equal(storage.getItem(key), null);
  }
});

test('rejects invalid draft values and document keys outside definition/shareholder rules', () => {
  const invalidDrafts = [
    { ...completeDraft(), contact: { ...completeDraft().contact, email: 4 } },
    { ...completeDraft(), unexpected: true },
    {
      ...completeDraft(),
      documentReadiness: { 'passport-copy:shareholder-999': 'ready' },
    },
    { ...completeDraft(), documentReadiness: { 'unknown:contact': 'ready' } },
  ];

  for (const draft of invalidDrafts) {
    const storage = new MemoryStorage();
    const result = saveApplicationDraft({
      storage,
      key,
      tier: 'session',
      draft: draft as never,
      definition: APPLICATION_DEFINITION,
      now,
    });
    assert.equal(result.status, 'invalid-draft');
    assert.equal(storage.getItem(key), null);
  }
});

test('enforces a strict maximum serialized size on save and load', () => {
  const storage = new MemoryStorage();
  const result = saveApplicationDraft({
    storage,
    key,
    tier: 'session',
    draft: {
      ...completeDraft(),
      business: { ...completeDraft().business, summary: 'x'.repeat(200_000) },
    },
    definition: APPLICATION_DEFINITION,
    now,
  });
  assert.equal(result.status, 'too-large');

  storage.setItem(key, 'x'.repeat(200_000));
  const loaded = loadApplicationDraft({
    storage,
    key,
    tier: 'session',
    definition: APPLICATION_DEFINITION,
    now,
  });
  assert.deepEqual(loaded, { status: 'discarded', reason: 'too-large', cleared: true });
});

test('reports unavailable storage operations without throwing', () => {
  for (const operation of ['get', 'set', 'remove'] as const) {
    const storage = new MemoryStorage();
    storage.fail = operation;
    const result =
      operation === 'get'
        ? loadApplicationDraft({
            storage,
            key,
            tier: 'session',
            definition: APPLICATION_DEFINITION,
            now,
          })
        : operation === 'set'
          ? saveApplicationDraft({
              storage,
              key,
              tier: 'session',
              draft: completeDraft(),
              definition: APPLICATION_DEFINITION,
              now,
            })
          : clearApplicationDraft(storage, key);
    assert.equal(result.status, 'unavailable');
  }
});

test('does not overwrite storage changed after the caller last observed it', () => {
  const storage = new MemoryStorage();
  const first = saveApplicationDraft({
    storage,
    key,
    tier: 'local',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });
  assert.equal(first.status, 'saved');

  const newer = new Date(now.getTime() + 2_000);
  saveApplicationDraft({
    storage,
    key,
    tier: 'local',
    draft: { ...completeDraft(), contact: { ...completeDraft().contact, fullName: 'Newer' } },
    definition: APPLICATION_DEFINITION,
    now: newer,
    expectedSavedAt: now.toISOString(),
  });
  const before = storage.getItem(key);

  const conflict = saveApplicationDraft({
    storage,
    key,
    tier: 'local',
    draft: { ...completeDraft(), contact: { ...completeDraft().contact, fullName: 'Stale' } },
    definition: APPLICATION_DEFINITION,
    now: new Date(now.getTime() + 3_000),
    expectedSavedAt: now.toISOString(),
  });
  assert.deepEqual(conflict, {
    status: 'conflict',
    storedSavedAt: newer.toISOString(),
  });
  assert.equal(storage.getItem(key), before);
});

test('does not replace a newer in-memory draft with an older stored draft', () => {
  const storage = new MemoryStorage();
  saveApplicationDraft({
    storage,
    key,
    tier: 'session',
    draft: completeDraft(),
    definition: APPLICATION_DEFINITION,
    now,
  });

  const result = loadApplicationDraft({
    storage,
    key,
    tier: 'session',
    definition: APPLICATION_DEFINITION,
    now: new Date(now.getTime() + 5_000),
    newerInMemorySavedAt: new Date(now.getTime() + 1_000).toISOString(),
  });
  assert.deepEqual(result, { status: 'conflict', storedSavedAt: now.toISOString() });
});

test('clear/reset removes the selected draft and reports whether it was cleared', () => {
  const storage = new MemoryStorage();
  storage.setItem(key, 'value');
  assert.deepEqual(clearApplicationDraft(storage, key), { status: 'cleared' });
  assert.equal(storage.getItem(key), null);
  storage.setItem(key, 'value');
  assert.deepEqual(resetApplicationDraft(storage, key), { status: 'cleared' });
  assert.equal(storage.getItem(key), null);
});
