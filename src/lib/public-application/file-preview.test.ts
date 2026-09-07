import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPLICATION_DEFINITION, EMPTY_APPLICATION_DRAFT } from './definition';
import {
  APPLICATION_FILE_SIZE_LIMIT_BYTES,
  clearFilePreviewsAfterRefresh,
  clearFilePreviewsAfterReset,
  clearFilePreviewsAfterSuccess,
  getAllowedDocumentControlIds,
  removePreviewFile,
  selectPreviewFile,
  type FilePreviewState,
} from './file-preview';

const allowed = getAllowedDocumentControlIds(APPLICATION_DEFINITION, EMPTY_APPLICATION_DRAFT);

test('derives contact, business and current-shareholder document controls from rules', () => {
  assert.deepEqual(allowed, [
    'passport-copy:contact',
    'activity-summary:business',
    'passport-copy:shareholder-1',
  ]);
  const twoShareholders = {
    ...EMPTY_APPLICATION_DRAFT,
    shareholders: [
      EMPTY_APPLICATION_DRAFT.shareholders[0],
      { ...EMPTY_APPLICATION_DRAFT.shareholders[0], id: 'shareholder-2' as const },
    ],
  };
  assert.ok(
    getAllowedDocumentControlIds(APPLICATION_DEFINITION, twoShareholders).includes(
      'passport-copy:shareholder-2',
    ),
  );
});

test('accepts one PDF/JPEG/PNG descriptor and exposes sanitized display metadata only', () => {
  const state: FilePreviewState = {};
  const result = selectPreviewFile({
    state,
    controlId: allowed[0],
    files: [{ name: '../private\u0000/passport.pdf', type: 'application/pdf', size: 4_000 }],
    definition: APPLICATION_DEFINITION,
    draft: EMPTY_APPLICATION_DRAFT,
  });

  assert.equal(result.status, 'accepted');
  if (result.status !== 'accepted') return;
  assert.deepEqual(result.state[allowed[0]], {
    displayName: 'passport.pdf',
    mediaType: 'application/pdf',
    sizeBytes: 4_000,
  });
  assert.deepEqual(Object.keys(result.state[allowed[0]]!), [
    'displayName',
    'mediaType',
    'sizeBytes',
  ]);
});

test('rejects unknown controls, multiple files, unsupported types and oversized files', () => {
  const base = {
    state: {} as FilePreviewState,
    definition: APPLICATION_DEFINITION,
    draft: EMPTY_APPLICATION_DRAFT,
  };
  assert.equal(
    selectPreviewFile({
      ...base,
      controlId: 'passport-copy:shareholder-999',
      files: [{ name: 'a.pdf', type: 'application/pdf', size: 1 }],
    }).status,
    'invalid-control',
  );
  assert.equal(
    selectPreviewFile({
      ...base,
      controlId: allowed[0],
      files: [
        { name: 'a.pdf', type: 'application/pdf', size: 1 },
        { name: 'b.pdf', type: 'application/pdf', size: 1 },
      ],
    }).status,
    'multiple-files',
  );
  assert.equal(
    selectPreviewFile({
      ...base,
      controlId: allowed[0],
      files: [{ name: 'a.svg', type: 'image/svg+xml', size: 1 }],
    }).status,
    'unsupported-type',
  );
  assert.equal(
    selectPreviewFile({
      ...base,
      controlId: allowed[0],
      files: [
        {
          name: 'large.pdf',
          type: 'application/pdf',
          size: APPLICATION_FILE_SIZE_LIMIT_BYTES + 1,
        },
      ],
    }).status,
    'too-large',
  );
});

test('rejects malformed display metadata without touching existing state', () => {
  const state = {
    [allowed[0]]: { displayName: 'safe.pdf', mediaType: 'application/pdf' as const, sizeBytes: 1 },
  };
  for (const file of [
    { name: '', type: 'application/pdf', size: 1 },
    { name: 'x.pdf', type: 'application/pdf', size: -1 },
    { name: 'x.pdf', type: 'application/pdf', size: Number.NaN },
  ]) {
    const result = selectPreviewFile({
      state,
      controlId: allowed[0],
      files: [file],
      definition: APPLICATION_DEFINITION,
      draft: EMPTY_APPLICATION_DRAFT,
    });
    assert.equal(result.status, 'invalid-file');
    assert.equal(result.state, state);
  }
});

test('reselect replaces one control and remove leaves all other controls intact', () => {
  const first = selectPreviewFile({
    state: {},
    controlId: allowed[0],
    files: [{ name: 'first.jpg', type: 'image/jpeg', size: 10 }],
    definition: APPLICATION_DEFINITION,
    draft: EMPTY_APPLICATION_DRAFT,
  });
  assert.equal(first.status, 'accepted');
  if (first.status !== 'accepted') return;
  const second = selectPreviewFile({
    state: first.state,
    controlId: allowed[0],
    files: [{ name: 'second.png', type: 'image/png', size: 20 }],
    definition: APPLICATION_DEFINITION,
    draft: EMPTY_APPLICATION_DRAFT,
  });
  assert.equal(second.status, 'accepted');
  if (second.status !== 'accepted') return;
  assert.equal(second.state[allowed[0]]?.displayName, 'second.png');
  assert.deepEqual(removePreviewFile(second.state, allowed[0]), {});
});

test('refresh, reset and success discard every in-memory preview', () => {
  const state: FilePreviewState = {
    [allowed[0]]: { displayName: 'a.pdf', mediaType: 'application/pdf', sizeBytes: 1 },
  };
  assert.deepEqual(clearFilePreviewsAfterRefresh(state), {});
  assert.deepEqual(clearFilePreviewsAfterReset(state), {});
  assert.deepEqual(clearFilePreviewsAfterSuccess(state), {});
});

test('file preview source has no byte reads, hashes, object URLs, network or persistence calls', async () => {
  const source = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('./file-preview.ts', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(
    source,
    /arrayBuffer|FileReader|createObjectURL|crypto|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB/i,
  );
});
