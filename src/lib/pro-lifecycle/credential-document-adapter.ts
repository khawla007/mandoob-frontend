import 'server-only';

import { ApiError } from '@/lib/errors';
import { validateDocumentUpload } from '@/lib/storage/document-upload-validation';
import { PRO_CREDENTIAL_EVIDENCE_MAX_BYTES } from '@/lib/validation/pro-lifecycle';

const CREDENTIAL_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export async function validateCredentialDocumentUpload(input: {
  data: Uint8Array;
  filename: string;
  mimeType: string;
}) {
  const validated = await validateDocumentUpload({
    ...input,
    maxBytes: PRO_CREDENTIAL_EVIDENCE_MAX_BYTES,
  });
  if (!CREDENTIAL_MIME_TYPES.has(validated.mimeType)) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 'Credential media type does not match', 415);
  }
  return validated as typeof validated & {
    mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  };
}
