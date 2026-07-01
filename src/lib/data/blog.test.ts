import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeBlogHtml } from '@/lib/blog/render';
import { normalizeBlogSlug } from '@/lib/blog/slug';
import { isBlogPostPublic } from '@/lib/blog/visibility';
import {
  MAX_GALLERY_IMAGES,
  blogPostInputSchema,
  blogTermInputSchema,
} from '@/lib/validation/blog';

test('normalizeBlogSlug lowercases, trims, and removes unsafe characters', () => {
  assert.equal(normalizeBlogSlug('  Hello, Dubai PRO! 2026  '), 'hello-dubai-pro-2026');
  assert.equal(normalizeBlogSlug('Launch___Week / Updates'), 'launch-week-updates');
});

test('normalizeBlogSlug falls back to post when no safe characters remain', () => {
  assert.equal(normalizeBlogSlug(' !!! '), 'post');
});

test('isBlogPostPublic only allows non-deleted published posts at or before now', () => {
  const now = new Date('2026-07-01T10:00:00.000Z');
  const published = {
    status: 'published',
    publishedAt: '2026-07-01T09:59:59.000Z',
    deletedAt: null,
  };

  assert.equal(isBlogPostPublic(published, now), true);
  assert.equal(isBlogPostPublic({ ...published, status: 'draft' }, now), false);
  assert.equal(isBlogPostPublic({ ...published, status: 'scheduled' }, now), false);
  assert.equal(isBlogPostPublic({ ...published, status: 'archived' }, now), false);
  assert.equal(
    isBlogPostPublic({ ...published, publishedAt: '2026-07-01T10:00:01.000Z' }, now),
    false,
  );
  assert.equal(isBlogPostPublic({ ...published, deletedAt: '2026-07-01T09:00:00.000Z' }, now), false);
});

test('sanitizeBlogHtml strips scripts and unsafe event handlers', () => {
  const sanitized = sanitizeBlogHtml(
    '<p onclick="alert(1)">Hi<script>alert(2)</script><a href="javascript:alert(3)" onmouseover="x">bad</a><img src="https://example.com/a.jpg" onerror="x"><img src="data:image/png;base64,abc"></p>',
  );

  assert.equal(sanitized.includes('<script>'), false);
  assert.equal(sanitized.includes('onclick'), false);
  assert.equal(sanitized.includes('onmouseover'), false);
  assert.equal(sanitized.includes('onerror'), false);
  assert.equal(sanitized.includes('javascript:'), false);
  assert.equal(sanitized.includes('data:image'), false);
  assert.match(sanitized, /<img[^>]+src="https:\/\/example\.com\/a\.jpg"/);
});

test('blogPostInputSchema enforces title, status, and gallery count', () => {
  const validInput = {
    title: 'Mainland setup guide',
    slug: 'mainland-setup-guide',
    status: 'draft',
    contentJson: { type: 'doc', content: [] },
    contentHtml: '<p>Body</p>',
    galleryMediaIds: ['00000000-0000-4000-8000-000000000001'],
  };

  assert.equal(blogPostInputSchema.safeParse(validInput).success, true);
  assert.equal(blogPostInputSchema.safeParse({ ...validInput, title: '' }).success, false);
  assert.equal(blogPostInputSchema.safeParse({ ...validInput, status: 'live' }).success, false);
  assert.equal(
    blogPostInputSchema.safeParse({ ...validInput, status: 'published' }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      status: 'published',
      publishedAt: '2026-07-01T10:00:00.000Z',
      scheduledFor: '2026-07-02T10:00:00.000Z',
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({ ...validInput, status: 'scheduled' }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      status: 'scheduled',
      scheduledFor: '2026-07-02T10:00:00.000Z',
    }).success,
    true,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      termIds: [
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000010',
      ],
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      galleryMediaIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
      ],
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      galleryMediaIds: Array.from(
        { length: MAX_GALLERY_IMAGES + 1 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ),
    }).success,
    false,
  );
});

test('blogTermInputSchema requires a supported term kind', () => {
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'category', name: 'Company setup', slug: 'company-setup' })
      .success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'attribute', name: 'Featured', slug: 'featured' }).success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'tag', name: 'Dubai', slug: 'dubai' }).success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'topic', name: 'Dubai', slug: 'dubai' }).success,
    false,
  );
});
