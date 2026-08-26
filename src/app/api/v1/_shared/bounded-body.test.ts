import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BodyTooLargeError,
  readBoundedBody,
  readBoundedFormData,
  readBoundedJson,
} from './bounded-body';

test('bounded body rejects oversized Content-Length without reading the stream', async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });
  const request = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-length': '9' },
    body,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(() => readBoundedBody(request, 8), BodyTooLargeError);
  assert.equal(request.bodyUsed, false);
  assert.ok(pulls <= 1, 'the platform may prefill one chunk, but the helper must not consume it');
});

test('bounded body cancels a chunked stream as soon as it crosses the cap', async () => {
  let pulls = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(5));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('http://localhost/test', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(() => readBoundedBody(request, 8), BodyTooLargeError);
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);
});

test('bounded JSON and multipart readers preserve valid request data', async () => {
  const json = new Request('http://localhost/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'save' }),
  });
  assert.deepEqual(await readBoundedJson(json, 64 * 1024), { command: 'save' });

  const form = new FormData();
  form.set('credentialId', 'fixture');
  form.set('file', new File(['proof'], 'proof.pdf', { type: 'application/pdf' }));
  const parsed = await readBoundedFormData(
    new Request('http://localhost/test', { method: 'POST', body: form }),
    128 * 1024,
  );
  assert.equal(parsed.get('credentialId'), 'fixture');
  assert.equal((parsed.get('file') as File).name, 'proof.pdf');
});
