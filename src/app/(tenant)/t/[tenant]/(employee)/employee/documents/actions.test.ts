import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8');

test('employee document signing forwards the authenticated actor and returns the exact DAL result', () => {
  assert.match(source, /authorizeEmployeePortalRead\(slug\)/u);
  assert.match(
    source,
    /getEmployeeDocumentSignedUrl\([\s\S]*?access\.session\.id,[\s\S]*?access\.tenant\.id,[\s\S]*?versionId/u,
  );
  assert.match(source, /return \{ ok: true, data: signed \}/u);
  assert.doesNotMatch(source, /Date\.now|300_000|createSignedUrl|storage_path/u);
});

test('employee document action exposes only stable safe failure codes', () => {
  assert.match(source, /logSafeActionError\('employee\.document\.open', error\)/u);
  assert.match(source, /'DOCUMENT_UNAVAILABLE'/u);
  assert.match(source, /'OPEN_FAILED'/u);
  assert.doesNotMatch(source, /error\.message|console\.error|tenant-documents/u);
});
