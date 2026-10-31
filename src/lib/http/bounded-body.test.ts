import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BODY_LIMITS,
  BodyReadError,
  BodyTooLargeError,
  InvalidContentLengthError,
  createBoundedRequest,
  decodeBoundedUtf8,
  readBoundedBody,
  readBoundedJson,
} from './bounded-body';

const encoder = new TextEncoder();

function requestWithStream(
  chunks: Uint8Array[],
  options: {
    contentLength?: string;
    onCancel?: (reason: unknown) => void;
    onRead?: () => void;
  } = {},
): Request {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      options.onRead?.();
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel(reason) {
      options.onCancel?.(reason);
    },
  });
  const headers = new Headers();
  if (options.contentLength !== undefined) headers.set('content-length', options.contentLength);
  return { body: stream, headers } as Request;
}

test('rejects a declared overflow without reading the stream', async () => {
  let reads = 0;
  const body = {
    getReader() {
      return {
        cancel: async () => undefined,
        read: async () => {
          reads++;
          return { done: false as const, value: encoder.encode('secret body') };
        },
        releaseLock() {},
      };
    },
  } as unknown as ReadableStream<Uint8Array>;
  const request = {
    body,
    headers: new Headers({ 'content-length': '11' }),
  } as Request;

  await assert.rejects(readBoundedBody(request, 10), (error: unknown) => {
    assert.ok(error instanceof BodyTooLargeError);
    assert.equal(error.code, 'BODY_TOO_LARGE');
    assert.doesNotMatch(error.message, /secret/u);
    return true;
  });
  assert.equal(reads, 0);
});

test('rejects an actual overflow when content-length is missing', async () => {
  await assert.rejects(
    readBoundedBody(requestWithStream([encoder.encode('123456')]), 5),
    BodyTooLargeError,
  );
});

test('does not trust an understated content-length', async () => {
  await assert.rejects(
    readBoundedBody(
      requestWithStream([encoder.encode('123'), encoder.encode('456')], { contentLength: '2' }),
      5,
    ),
    BodyTooLargeError,
  );
});

test('rejects overflow accumulated across multiple chunks', async () => {
  await assert.rejects(
    readBoundedBody(
      requestWithStream([encoder.encode('12'), encoder.encode('34'), encoder.encode('56')]),
      5,
    ),
    BodyTooLargeError,
  );
});

test('accepts a body exactly at the byte limit', async () => {
  const bytes = await readBoundedBody(
    requestWithStream([encoder.encode('12'), encoder.encode('345')]),
    5,
  );

  assert.equal(decodeBoundedUtf8(bytes), '12345');
});

test('enforces the limit by UTF-8 bytes rather than characters', async () => {
  const multibyte = encoder.encode('€');
  assert.equal(multibyte.byteLength, 3);
  assert.deepEqual(await readBoundedBody(requestWithStream([multibyte]), 3), multibyte);
  await assert.rejects(readBoundedBody(requestWithStream([multibyte]), 2), BodyTooLargeError);
});

test('returns an empty Uint8Array when the request has no body', async () => {
  const body = await readBoundedBody(
    { body: null, headers: new Headers({ 'content-length': '0' }) } as Request,
    0,
  );

  assert.ok(body instanceof Uint8Array);
  assert.equal(body.byteLength, 0);
});

test('rejects invalid maximum byte limits', async () => {
  const request = { body: null, headers: new Headers() } as Request;
  for (const limit of [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(readBoundedBody(request, limit), TypeError);
  }
});

test('rejects malformed, negative, and non-integer content-length values', async () => {
  for (const contentLength of ['', '-1', '1.5', '12 bytes']) {
    await assert.rejects(
      readBoundedBody(requestWithStream([], { contentLength }), 100),
      (error: unknown) => {
        assert.ok(error instanceof InvalidContentLengthError);
        assert.equal(error.code, 'INVALID_CONTENT_LENGTH');
        assert.equal(error.message, 'invalid content-length');
        return true;
      },
    );
  }
});

test('sanitizes stream read failures and releases the reader lock', async () => {
  const secret = 'private-body-fragment';
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error(secret));
    },
  });

  await assert.rejects(
    readBoundedBody({ body: stream, headers: new Headers() } as Request, 100),
    (error: unknown) => {
      assert.ok(error instanceof BodyReadError);
      assert.equal(error.code, 'BODY_READ_ERROR');
      assert.equal(error.message, 'request body could not be read');
      assert.doesNotMatch(error.message, new RegExp(secret, 'u'));
      return true;
    },
  );
  const nextReader = stream.getReader();
  nextReader.releaseLock();
});

test('cancels the stream exactly once on actual overflow', async () => {
  let cancellations = 0;
  await assert.rejects(
    readBoundedBody(
      requestWithStream([encoder.encode('123456')], {
        onCancel: () => cancellations++,
      }),
      5,
    ),
    BodyTooLargeError,
  );

  assert.equal(cancellations, 1);
});

test('does not replace the overflow error when stream cancellation fails', async () => {
  const stream = {
    getReader() {
      return {
        cancel: async () => {
          throw new Error('cancel failure');
        },
        read: async () => ({ done: false as const, value: encoder.encode('123456') }),
        releaseLock() {},
      };
    },
  } as unknown as ReadableStream<Uint8Array>;

  await assert.rejects(
    readBoundedBody({ body: stream, headers: new Headers() } as Request, 5),
    BodyTooLargeError,
  );
});

test('preserves exact bytes across chunk concatenation', async () => {
  const expected = new Uint8Array([0, 255, 1, 128, 2, 3]);
  const actual = await readBoundedBody(
    requestWithStream([expected.subarray(0, 2), expected.subarray(2, 5), expected.subarray(5)]),
    expected.byteLength,
  );

  assert.deepEqual(actual, expected);
});

test('decodes valid multibyte UTF-8', () => {
  assert.equal(decodeBoundedUtf8(encoder.encode('مرحبا 🌍')), 'مرحبا 🌍');
});

test('rejects invalid UTF-8 byte sequences', () => {
  assert.throws(() => decodeBoundedUtf8(new Uint8Array([0xc3, 0x28])), TypeError);
});

test('reads, decodes, and parses bounded JSON', async () => {
  const value = await readBoundedJson<{ greeting: string }>(
    requestWithStream([encoder.encode('{"greeting":"مرحبا"}')]),
    64,
  );

  assert.deepEqual(value, { greeting: 'مرحبا' });
});

test('propagates native invalid JSON behavior after a bounded read', async () => {
  await assert.rejects(
    readBoundedJson(requestWithStream([encoder.encode('{not json')]), 64),
    SyntaxError,
  );
});

test('reconstructs a request with bounded bytes and allowlisted multipart metadata', async () => {
  const original = new Request('https://example.test/upload?draft=1', {
    method: 'POST',
    headers: {
      authorization: 'Bearer secret',
      cookie: 'session=secret',
      'content-length': '999999',
      'content-type': 'multipart/form-data; boundary=example',
      'x-request-id': 'private-trace',
    },
  });
  const bytes = new Uint8Array([0, 1, 2, 255]);

  const bounded = createBoundedRequest(original, bytes);

  assert.equal(bounded.url, original.url);
  assert.equal(bounded.method, 'POST');
  assert.equal(bounded.headers.get('content-type'), 'multipart/form-data; boundary=example');
  assert.equal(bounded.headers.get('authorization'), null);
  assert.equal(bounded.headers.get('cookie'), null);
  assert.equal(bounded.headers.get('content-length'), null);
  assert.equal(bounded.headers.get('x-request-id'), null);
  assert.deepEqual(new Uint8Array(await bounded.arrayBuffer()), bytes);
});

test('exports the central request body limits', () => {
  assert.deepEqual(BODY_LIMITS, {
    publicJson: 64 * 1024,
    providerWebhook: 256 * 1024,
    publicMultipart: 12 * 1024 * 1024,
  });
});
