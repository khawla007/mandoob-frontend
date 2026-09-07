import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const proPage = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(pro)/meetings/page.tsx', import.meta.url),
  'utf8',
);
const proActions = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(pro)/meetings/actions.ts', import.meta.url),
  'utf8',
);
const customerPage = readFileSync(
  new URL('../../app/(tenant)/t/[tenant]/(customer)/portal/meetings/page.tsx', import.meta.url),
  'utf8',
);

test('PRO meetings bind reads, cancellation, and recordings to the assigned Company', () => {
  assert.match(proPage, /readAssignedCompanyForPro/u);
  assert.match(proPage, /listMeetingsForCompany/u);
  assert.match(proPage, /getCompanyMeetingRecordingSignedUrl/u);
  assert.doesNotMatch(proPage, /listMeetingsForTenant/u);
  assert.match(proActions, /readAssignedCompanyForPro/u);
  assert.match(proActions, /cancelCompanyMeeting/u);
});

test('Customer meetings use the linked-Company authorization boundary', () => {
  assert.match(customerPage, /authorizeCustomerLinkedCompanyRead/u);
  assert.match(customerPage, /access\.kind !== 'authorized'/u);
  assert.match(customerPage, /listMeetingsForCustomerCompany/u);
  assert.match(customerPage, /getCustomerCompanyMeetingRecordingSignedUrl/u);
  assert.doesNotMatch(customerPage, /readSelfCustomer\(\)\.catch/u);
});

test('meeting pages use shared presentation and never derive labels with replace', () => {
  assert.match(proPage, /OperationalMeetingList/u);
  assert.match(customerPage, /OperationalMeetingList/u);
  assert.doesNotMatch(proPage, /status\.replace/u);
  assert.doesNotMatch(customerPage, /status\.replace/u);
});
