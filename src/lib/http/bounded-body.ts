import 'server-only';

export const BODY_LIMITS = {
  publicJson: 64 * 1024,
  providerWebhook: 256 * 1024,
  // Multipart buffering and parsing can temporarily retain roughly 2-3x this byte cap.
  publicMultipart: 12 * 1024 * 1024,
} as const;

export class BodyTooLargeError extends Error {
  readonly code = 'BODY_TOO_LARGE' as const;

  constructor() {
    super('request body exceeds limit');
    this.name = 'BodyTooLargeError';
  }
}

export class InvalidContentLengthError extends Error {
  readonly code = 'INVALID_CONTENT_LENGTH' as const;

  constructor() {
    super('invalid content-length');
    this.name = 'InvalidContentLengthError';
  }
}

export class BodyReadError extends Error {
  readonly code = 'BODY_READ_ERROR' as const;

  constructor() {
    super('request body could not be read');
    this.name = 'BodyReadError';
  }
}

export class InvalidBoundedRequestMethodError extends Error {
  readonly code = 'INVALID_BOUNDED_REQUEST_METHOD' as const;

  constructor() {
    super('request method does not support a body');
    this.name = 'InvalidBoundedRequestMethodError';
  }
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError('invalid body limit');
  }

  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader !== null) {
    if (!/^\d+$/u.test(declaredHeader)) throw new InvalidContentLengthError();
    if (Number(declaredHeader) > maxBytes) throw new BodyTooLargeError();
  }

  if (request.body === null) return new Uint8Array();

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    throw new BodyReadError();
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel('body limit exceeded');
        } catch {
          // Cancellation is best-effort; overflow remains the primary error.
        }
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error;
    throw new BodyReadError();
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function decodeBoundedUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBoundedBody(request, maxBytes);
  return JSON.parse(decodeBoundedUtf8(bytes)) as unknown;
}

export function createBoundedRequest(request: Request, bytes: Uint8Array): Request {
  if (request.method === 'GET' || request.method === 'HEAD') {
    throw new InvalidBoundedRequestMethodError();
  }

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType !== null) headers.set('content-type', contentType);

  return new Request(request.url, {
    body: bytes as BodyInit,
    headers,
    method: request.method,
  });
}
