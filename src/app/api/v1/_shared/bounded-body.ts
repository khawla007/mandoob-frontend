import 'server-only';

import { BODY_LIMITS, createBoundedRequest, readBoundedBody } from '@/lib/http/bounded-body';

export { BodyTooLargeError, readBoundedBody, readBoundedJson } from '@/lib/http/bounded-body';

export const JSON_BODY_MAX_BYTES = BODY_LIMITS.publicJson;
// Multipart fields, boundaries, and headers may use at most 64 KiB beyond the 10 MiB file cap.
export const MULTIPART_BODY_ENVELOPE_BYTES = 64 * 1024;

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get('content-type');
  if (!contentType) throw new TypeError('missing_content_type');
  const bytes = await readBoundedBody(request, maxBytes);
  return createBoundedRequest(request, bytes).formData();
}
