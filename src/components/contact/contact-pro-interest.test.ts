import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const contactPage = readFileSync(
  new URL('../../app/(public)/contact/page.tsx', import.meta.url),
  'utf8',
);
const contactBody = readFileSync(
  new URL('../site/contact/ContactPageBody.tsx', import.meta.url),
  'utf8',
);
const contactForm = readFileSync(new URL('./ContactForm.tsx', import.meta.url), 'utf8');

test('contact route safely recognizes and presents the PRO interest handoff', () => {
  assert.match(contactPage, /resolveContactTopic/u);
  assert.match(contactPage, /proInterest=\{topic === 'pro-interest'\}/u);
  assert.match(contactBody, /initialTopic=\{proInterest \? 'pro-interest' : undefined\}/u);
  assert.match(contactForm, /initialTopic === 'pro-interest'/u);
  assert.match(contactForm, /Message delivery remains unavailable/u);
});

test('PRO interest context retains the fail-closed production adapter', () => {
  assert.match(contactForm, /productionContactAdapter/u);
  assert.doesNotMatch(contactPage, /fetch\s*\(|POST|server action/iu);
  assert.doesNotMatch(contactBody, /fetch\s*\(|POST|server action/iu);
});
