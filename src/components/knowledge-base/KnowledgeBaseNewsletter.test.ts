import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveNewsletterOutcome, validateNewsletterEmail } from './KnowledgeBaseNewsletter';

test('newsletter validates email without sending or persisting it', () => {
  assert.equal(validateNewsletterEmail(''), 'Enter an email address.');
  assert.equal(validateNewsletterEmail('reader@example'), 'Enter a valid email address.');
  assert.equal(validateNewsletterEmail('reader@example.com'), null);
});

test('production always resolves to no-write unavailable delivery', () => {
  assert.equal(resolveNewsletterOutcome('success', true), 'unavailable');
  assert.equal(resolveNewsletterOutcome('failure', true), 'unavailable');
  assert.equal(resolveNewsletterOutcome('success', false), 'success');
  assert.equal(resolveNewsletterOutcome('failure', false), 'failure');
});

test('newsletter client contains no remote mutation primitives', () => {
  const source = readFileSync(new URL('./KnowledgeBaseNewsletter.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|FormData|server action/iu);
  assert.match(source, /This preview does not subscribe or store your email/u);
  assert.match(source, /aria-live="polite"/u);
});
