import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_GALLERY_IMAGE_BYTES } from '@/lib/validation/blog';
import { runHeroUpload, validateHeroUpload } from './page-hero-upload';

test('oversized hero files short-circuit before invoking the server action', async () => {
  let calls = 0;
  const file = { name: 'huge.webp', type: 'image/webp', size: MAX_GALLERY_IMAGE_BYTES + 1 };
  assert.match(validateHeroUpload(file), /8 MiB/);
  const result = await runHeroUpload(file, async () => { calls += 1; throw new Error('must not run'); });
  assert.equal(calls, 0);
  assert.deepEqual(result, { ok: false, error: 'Hero image must be 8 MiB or smaller.' });
});

test('missing and unsupported files return clear validation errors', () => {
  assert.equal(validateHeroUpload(null), 'Choose an image to upload.');
  assert.equal(validateHeroUpload({ name: 'hero.svg', type: 'image/svg+xml', size: 12 }), 'Use a JPEG, PNG, WebP, or AVIF image.');
});

test('server-action transport rejection maps to a stable visible error', async () => {
  const file = { name: 'hero.webp', type: 'image/webp', size: 1024 };
  const result = await runHeroUpload(file, async () => { throw new Error('413 transport detail'); });
  assert.deepEqual(result, { ok: false, error: 'Upload failed before the server could process it. Please try again.' });
});
