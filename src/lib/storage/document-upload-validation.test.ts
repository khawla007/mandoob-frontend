import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { ApiError } from '../errors';
import { sanitizeFilename } from '../validation/document';
import * as mod from './document-upload-validation';
import type {
  DocumentUploadInput as UploadInput,
  DocumentUploadPathInput as PathInput,
} from './document-upload-validation';

async function subject(): Promise<typeof mod> {
  return mod;
}

const MAX_BYTES = 25 * 1024 * 1024;
const PDF = Buffer.from('%PDF-1.7\nprivate document body\n%%EOF');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(32)]);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=',
  'base64',
);
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// A real, stored ZIP entry with CRC and central directory, not a mocked detector.
function officeZip(mime: string): Buffer {
  const name = Buffer.from('[Content_Types].xml');
  const body = Buffer.from(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/document.xml" ContentType="${mime}"/></Types>`,
  );
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + body.length, 16);
  return Buffer.concat([local, name, body, central, name, end]);
}

const baseUpload: UploadInput = { data: PDF, filename: 'private.pdf', mimeType: 'application/pdf' };
const basePath: PathInput = {
  tenantId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
  companyId: '00000000-0000-0000-0000-000000000002',
  operationId: '00000000-0000-0000-0000-000000000003',
  objectId: '00000000-0000-0000-0000-000000000004',
  extension: 'pdf',
};

function sanitizedError(code: string, status: number) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.details, undefined);
    assert.doesNotMatch(error.message, /private|document body|secret|\.\.\//u);
    return true;
  };
}

for (const input of [null, undefined]) {
  test(`rejects ${input} top-level upload input with a sanitized ApiError`, async () => {
    const { validateDocumentUpload } = await subject();
    await assert.rejects(
      validateDocumentUpload(input as unknown as UploadInput),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });

  test(`rejects ${input} top-level path input with a sanitized ApiError`, async () => {
    const { buildDocumentUploadPath } = await subject();
    assert.throws(
      () => buildDocumentUploadPath(input as unknown as PathInput),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });
}

for (const [data, extension, mimeType] of [
  [PDF, 'pdf', 'application/pdf'],
  [JPEG, 'jpg', 'image/jpeg'],
  [PNG, 'png', 'image/png'],
  [officeZip(DOCX_MIME.replace('.document', '.document.main+xml')), 'docx', DOCX_MIME],
  [officeZip(XLSX_MIME.replace('.sheet', '.sheet.main+xml')), 'xlsx', XLSX_MIME],
] as const) {
  test(`validates actual ${extension} bytes and returns server-computed metadata`, async () => {
    const { validateDocumentUpload } = await subject();
    const result = await validateDocumentUpload({
      data,
      filename: `private.${extension}`,
      mimeType,
    });
    assert.equal(result.mimeType, mimeType);
    assert.equal(result.extension, extension);
    assert.equal(result.sizeBytes, data.byteLength);
    assert.equal(result.sha256, createHash('sha256').update(data).digest('hex'));
    assert.equal(result.filename, `private.${extension}`);
    assert.deepEqual(result.data, new Uint8Array(data));
    assert.notEqual(result.data.buffer, data.buffer);
  });
}

test('accepts uppercase extension and sanitizes Unicode display filename using existing sanitizer', async () => {
  const { validateDocumentUpload } = await subject();
  const filename = 'وثيقة résumé FINAL.PDF';
  const result = await validateDocumentUpload({ ...baseUpload, filename });
  assert.equal(result.extension, 'pdf');
  assert.equal(result.filename, sanitizeFilename(filename));
});

test('treats JPEG and JPG filename extensions as equivalent', async () => {
  const { validateDocumentUpload } = await subject();
  for (const filename of ['private.jpeg', 'private.JPG', 'private.JPEG']) {
    assert.equal(
      (await validateDocumentUpload({ data: JPEG, filename, mimeType: 'image/jpeg' })).extension,
      'jpg',
    );
  }
});

for (const [name, override, code, status] of [
  ['empty', { data: new Uint8Array() }, 'PAYLOAD_EMPTY', 400],
  ['oversize', { data: new Uint8Array(MAX_BYTES + 1) }, 'PAYLOAD_TOO_LARGE', 413],
  ['custom size limit', { maxBytes: PDF.length - 1 }, 'PAYLOAD_TOO_LARGE', 413],
  ['spoofed MIME', { mimeType: 'image/png' }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['missing MIME', { mimeType: '' }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['spoofed extension', { filename: 'private.png' }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['missing extension', { filename: 'private' }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['unsupported extension', { filename: 'private.exe' }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  ['bad magic', { data: Buffer.from('private document body') }, 'UNSUPPORTED_MEDIA_TYPE', 415],
  [
    'unsupported actual format',
    { data: Buffer.from('GIF89a' + '\0'.repeat(32)) },
    'UNSUPPORTED_MEDIA_TYPE',
    415,
  ],
  [
    'truncated magic',
    { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    'UNSUPPORTED_MEDIA_TYPE',
    415,
  ],
  ['checksum mismatch', { expectedSha256: '0'.repeat(64) }, 'CHECKSUM_MISMATCH', 422],
] as const) {
  test(`rejects ${name} with stable sanitized error`, async () => {
    const { validateDocumentUpload } = await subject();
    await assert.rejects(
      validateDocumentUpload({ ...baseUpload, ...override }),
      sanitizedError(code, status),
    );
  });
}

for (const maxBytes of [0, -1, 1.5, NaN, Infinity, MAX_BYTES + 1]) {
  test(`rejects invalid maxBytes ${maxBytes}`, async () => {
    const { validateDocumentUpload } = await subject();
    await assert.rejects(
      validateDocumentUpload({ ...baseUpload, maxBytes }),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });
}

for (const filename of [
  '',
  '../secret.pdf',
  'private/secret.pdf',
  'private\\secret.pdf',
  'private\0.pdf',
  'private\n.pdf',
  'private\u007f.pdf',
  'private%2fsecret.pdf',
  'private%252fsecret.pdf',
  'private..pdf',
]) {
  test(`rejects unsafe filename ${JSON.stringify(filename)}`, async () => {
    const { validateDocumentUpload } = await subject();
    await assert.rejects(
      validateDocumentUpload({ ...baseUpload, filename }),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });
}

for (const expectedSha256 of [
  '',
  'a'.repeat(63),
  'a'.repeat(65),
  'g'.repeat(64),
  ` ${'a'.repeat(64)}`,
  'private.pdf',
]) {
  test(`rejects malformed expected checksum ${expectedSha256.length}`, async () => {
    const { validateDocumentUpload } = await subject();
    await assert.rejects(
      validateDocumentUpload({ ...baseUpload, expectedSha256 }),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });
}

test('matches correct checksum including uppercase hex without trusting supplied checksum', async () => {
  const { validateDocumentUpload } = await subject();
  const expectedSha256 = createHash('sha256').update(PDF).digest('hex');
  for (const checksum of [expectedSha256, expectedSha256.toUpperCase()]) {
    assert.equal(
      (await validateDocumentUpload({ ...baseUpload, expectedSha256: checksum })).sha256,
      expectedSha256,
    );
  }
});

test('accepts exact 25 MiB and exact custom limit', async () => {
  const { validateDocumentUpload } = await subject();
  const data = new Uint8Array(MAX_BYTES);
  data.set(PDF);
  assert.equal((await validateDocumentUpload({ ...baseUpload, data })).sizeBytes, MAX_BYTES);
  assert.equal(
    (await validateDocumentUpload({ ...baseUpload, maxBytes: PDF.length })).sizeBytes,
    PDF.length,
  );
});

test('snapshots caller bytes before asynchronous sniffing and later mutation', async () => {
  const { validateDocumentUpload } = await subject();
  const data = Buffer.from(PDF);
  const pending = validateDocumentUpload({ ...baseUpload, data });
  data.fill(0);
  const result = await pending;
  assert.deepEqual(result.data, new Uint8Array(PDF));
  assert.equal(result.sha256, createHash('sha256').update(PDF).digest('hex'));
  data.fill(1);
  assert.deepEqual(result.data, new Uint8Array(PDF));
});

test('builds exact canonical path with PostgreSQL UUIDs and stable retry identity', async () => {
  const { buildDocumentUploadPath } = await subject();
  const path = buildDocumentUploadPath(basePath);
  assert.equal(
    path,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/00000000-0000-0000-0000-000000000002/documents/00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-000000000004.pdf',
  );
  assert.equal(buildDocumentUploadPath({ ...basePath }), path);
  assert.doesNotMatch(path, /private|sha256|filename/u);
  assert.notEqual(
    buildDocumentUploadPath({ ...basePath, objectId: '00000000-0000-0000-0000-000000000005' }),
    path,
  );
  assert.notEqual(
    buildDocumentUploadPath({ ...basePath, operationId: '00000000-0000-0000-0000-000000000006' }),
    path,
  );
});

for (const extension of ['pdf', 'jpg', 'png', 'docx', 'xlsx']) {
  test(`permits canonical path extension ${extension}`, async () => {
    const { buildDocumentUploadPath } = await subject();
    assert.ok(buildDocumentUploadPath({ ...basePath, extension }).endsWith(`.${extension}`));
  });
}

for (const key of ['tenantId', 'companyId', 'operationId', 'objectId'] as const) {
  for (const value of [
    '../secret',
    'private.pdf',
    'a'.repeat(64),
    `${basePath.companyId}/secret`,
    `%2f${basePath.companyId}`,
    ` ${basePath.companyId}`,
    `${basePath.companyId}\n`,
  ]) {
    test(`rejects unsafe ${key} ${JSON.stringify(value)}`, async () => {
      const { buildDocumentUploadPath } = await subject();
      assert.throws(
        () => buildDocumentUploadPath({ ...basePath, [key]: value }),
        sanitizedError('VALIDATION_FAILED', 400),
      );
    });
  }
}

for (const extension of ['jpeg', 'PDF', '', '../pdf', 'pdf/secret', 'pdf%2f', 'pdf\n', 'exe']) {
  test(`rejects noncanonical path extension ${JSON.stringify(extension)}`, async () => {
    const { buildDocumentUploadPath } = await subject();
    assert.throws(
      () => buildDocumentUploadPath({ ...basePath, extension }),
      sanitizedError('VALIDATION_FAILED', 400),
    );
  });
}
