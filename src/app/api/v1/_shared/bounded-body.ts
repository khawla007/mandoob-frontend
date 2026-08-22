import 'server-only';

export const JSON_BODY_MAX_BYTES = 64 * 1024;
// Multipart fields, boundaries, and headers may use at most 64 KiB beyond the 10 MiB file cap.
export const MULTIPART_BODY_ENVELOPE_BYTES = 64 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('request_body_too_large');
    this.name = 'BodyTooLargeError';
  }
}

function exceedsDeclaredLength(request: Request, maxBytes: number): boolean {
  const value = request.headers.get('content-length');
  if (value === null) return false;
  if (!/^\d+$/u.test(value)) return true;
  return BigInt(value) > BigInt(maxBytes);
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('invalid_body_limit');
  if (exceedsDeclaredLength(request, maxBytes)) throw new BodyTooLargeError();
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBoundedBody(request, maxBytes);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get('content-type');
  if (!contentType) throw new TypeError('missing_content_type');
  const bytes = await readBoundedBody(request, maxBytes);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  const bounded = new Request(request.url, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
  return bounded.formData();
}
