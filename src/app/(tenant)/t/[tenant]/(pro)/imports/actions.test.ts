import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/imports/actions.ts'),
  'utf8',
);

function body(action: string) {
  const start = source.indexOf(`export async function ${action}`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test('every import mutation resolves PRO route access, active tenant and assignment first', () => {
  for (const action of [
    'uploadBulkImportAction',
    'validateBulkImportAction',
    'executeBulkImportAction',
    'cancelBulkImportAction',
  ]) {
    assert.match(body(action), /await requireTenantContext\(tenantSlug\)/u, action);
  }
  assert.match(source, /await requireActiveTenant\(context\.tenant\.id\)/u);
  assert.match(source, /assignedProActor\(context, tenantSlug\)/u);
});

test('upload validates bounded bytes before storage, encrypts, and compensates orphans', () => {
  const upload = body('uploadBulkImportAction');
  assert.match(source, /const MAX_CSV_BYTES = IMPORT_LIMITS\.maxBytes/u);
  assert.match(upload, /file\.size > MAX_CSV_BYTES/u);
  assert.match(upload, /file\.type/u);
  assert.ok(upload.indexOf('validateEmployeeImportBytes(bytes)') < upload.indexOf('.upload('));
  assert.ok(upload.indexOf('encryptImportArtifact(') < upload.indexOf('.upload('));
  assert.match(
    upload,
    /catch \(error\) \{\s*const removed = await admin\.storage\.from\(BUCKET\)\.remove\(\[storagePath\]\)/u,
  );
  assert.doesNotMatch(source, /\.xlsx|application\/vnd\.openxmlformats/u);
  assert.doesNotMatch(source, /\.select\('\*'\)/u);
});

test('validation reads are access-audited and hash-verified; commands are versioned', () => {
  const validate = body('validateBulkImportAction');
  assert.ok(validate.indexOf('recordImportArtifactAccess(') < validate.indexOf('.download('));
  assert.match(validate, /sha256Hex\(plain\) !== job\.artifact_sha256/u);
  for (const action of [
    'validateBulkImportAction',
    'executeBulkImportAction',
    'cancelBulkImportAction',
  ]) {
    assert.match(body(action), /jobCommandSchema\.safeParse\(raw\)/u, action);
  }
  assert.match(source, /expected_version: z\.number\(\)\.int\(\)\.min\(1\)/u);
});
