import assert from 'node:assert/strict';
import test from 'node:test';

import { pageHeroSettingsSchema, pageInputSchema } from './pages';

const base = { title: 'About us', slug: 'about-us', contentJson: {}, contentHtml: '', status: 'draft' };

test('hero settings supply stable defaults', () => {
  assert.deepEqual(pageHeroSettingsSchema.parse({}), {
    backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0,
    headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center',
  });
});

test('hero opacity, colors, alignments, and safe CSS lengths are validated', () => {
  const valid = pageHeroSettingsSchema.safeParse({
    backgroundColor: '#0f172a', overlayColor: '#FFF', overlayOpacity: 0.5,
    headingAlignment: 'left', textAlignment: 'right', buttonAlignment: 'center',
    minHeight: '24rem', padding: '1rem 2px 3% auto',
  });
  assert.equal(valid.success, true);
  for (const value of [-0.1, 1.1]) assert.equal(pageHeroSettingsSchema.safeParse({ overlayOpacity: value }).success, false);
  for (const backgroundColor of ['red', '#12', '#abcd']) assert.equal(pageHeroSettingsSchema.safeParse({ backgroundColor }).success, false);
  for (const minHeight of ['calc(100% - 2px)', '10; color:red', '1 2 3 4 5px']) assert.equal(pageHeroSettingsSchema.safeParse({ minHeight }).success, false);
  assert.equal(pageHeroSettingsSchema.safeParse({ headingAlignment: 'justify' }).success, false);
});

test('button href permits internal paths and absolute HTTP(S) only', () => {
  for (const buttonHref of ['/contact', 'https://example.com/a', 'http://example.com']) {
    assert.equal(pageHeroSettingsSchema.safeParse({ buttonHref }).success, true);
  }
  for (const buttonHref of ['contact', 'javascript:alert(1)', 'mailto:a@example.com', 'tel:123']) {
    assert.equal(pageHeroSettingsSchema.safeParse({ buttonHref }).success, false);
  }
});

test('page publishing timestamps are required for their statuses', () => {
  assert.equal(pageInputSchema.safeParse({ ...base, status: 'published' }).success, false);
  assert.equal(pageInputSchema.safeParse({ ...base, status: 'published', publishedAt: '2026-07-01T00:00:00.000Z' }).success, true);
  assert.equal(pageInputSchema.safeParse({ ...base, status: 'scheduled' }).success, false);
  assert.equal(pageInputSchema.safeParse({ ...base, status: 'scheduled', scheduledFor: '2026-07-01T00:00:00.000Z' }).success, true);
});

test('page metadata has limits and schema markup must be an object', () => {
  assert.equal(pageInputSchema.safeParse({ ...base, metaTitle: 'x'.repeat(71) }).success, false);
  assert.equal(pageInputSchema.safeParse({ ...base, metaDescription: 'x'.repeat(171) }).success, false);
  assert.equal(pageInputSchema.safeParse({ ...base, schemaMarkup: ['not', 'object'] }).success, false);
  assert.equal(pageInputSchema.safeParse({ ...base, schemaMarkup: { '@type': 'WebPage' } }).success, true);
});
