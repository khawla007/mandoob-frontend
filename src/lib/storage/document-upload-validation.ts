import 'server-only';

import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';

import { ApiError } from '../errors';
import { sanitizeFilename } from '../validation/document';

const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS = new Map([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
]);
const PATH_EXTENSIONS = new Set(MIME_EXTENSIONS.values());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type DocumentUploadInput = {
  data: Uint8Array;
  filename: string;
  mimeType: string;
  expectedSha256?: string;
  maxBytes?: number;
};

export type ValidatedDocumentUpload = {
  data: Uint8Array;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  filename: string;
};

function invalidInput(): never {
  throw new ApiError('VALIDATION_FAILED', 'Invalid document upload input', 400);
}

function unsupportedMedia(): never {
  throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Document media type does not match', 415);
}

/** Validates and snapshots bytes; authorization and malware scanning remain separate boundaries. */
export async function validateDocumentUpload(
  input: DocumentUploadInput,
): Promise<ValidatedDocumentUpload> {
  if (input === null || typeof input !== 'object') invalidInput();
  const {
    data: callerData,
    filename,
    mimeType,
    expectedSha256,
    maxBytes = MAX_DOCUMENT_BYTES,
  } = input;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_DOCUMENT_BYTES) {
    invalidInput();
  }
  if (!(callerData instanceof Uint8Array)) invalidInput();
  if (callerData.byteLength === 0) {
    throw new ApiError('PAYLOAD_EMPTY', 'Document is empty', 400);
  }
  if (callerData.byteLength > maxBytes) {
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Document exceeds the upload size limit', 413);
  }
  if (
    typeof filename !== 'string' ||
    filename.trim().length === 0 ||
    /[\\/]|\p{Cc}|%[0-9a-f]{2}|\.\./iu.test(filename)
  ) {
    invalidInput();
  }
  if (
    expectedSha256 !== undefined &&
    (typeof expectedSha256 !== 'string' ||
      expectedSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/iu.test(expectedSha256))
  ) {
    invalidInput();
  }

  // Copy before the first await: Buffer.slice() would retain caller-owned memory.
  const data = new Uint8Array(callerData);
  let sniffed;
  try {
    sniffed = await fileTypeFromBuffer(data);
  } catch {
    unsupportedMedia();
  }
  const extension = sniffed && MIME_EXTENSIONS.get(sniffed.mime);
  const dot = filename.lastIndexOf('.');
  const filenameExtension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  const canonicalExtension = filenameExtension === 'jpeg' ? 'jpg' : filenameExtension;
  if (!sniffed || !extension || mimeType !== sniffed.mime || canonicalExtension !== extension) {
    unsupportedMedia();
  }

  const sha256 = createHash('sha256').update(data).digest('hex');
  if (expectedSha256 !== undefined && sha256 !== expectedSha256.toLowerCase()) {
    throw new ApiError('CHECKSUM_MISMATCH', 'Document checksum does not match', 422);
  }
  return {
    data,
    mimeType: sniffed.mime,
    extension,
    sizeBytes: data.byteLength,
    sha256,
    filename: sanitizeFilename(filename),
  };
}

export type DocumentUploadPathInput = {
  tenantId: string;
  companyId: string;
  operationId: string;
  objectId: string;
  extension: string;
};

function canonicalIdentifier(value: string): string {
  // PostgreSQL UUIDs need not have an RFC version/variant; require canonical DB syntax.
  if (typeof value !== 'string' || value.length !== 36 || !UUID.test(value)) invalidInput();
  return value.toLowerCase();
}

/** IDs must be resolved/generated server-side; this builder does not authorize ownership. */
export function buildDocumentUploadPath(input: DocumentUploadPathInput): string {
  if (input === null || typeof input !== 'object') invalidInput();
  const { tenantId, companyId, operationId, objectId, extension } = input;
  const tenant = canonicalIdentifier(tenantId);
  const company = canonicalIdentifier(companyId);
  const operation = canonicalIdentifier(operationId);
  const object = canonicalIdentifier(objectId);
  if (!PATH_EXTENSIONS.has(extension)) invalidInput();
  return `${tenant}/${company}/documents/${operation}/${object}.${extension}`;
}
