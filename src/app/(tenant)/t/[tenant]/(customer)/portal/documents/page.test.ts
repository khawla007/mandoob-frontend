import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('./page.tsx');
const row = read('../../../../../../../components/customer/DocumentRequestRow.tsx');
const loading = read('./loading.tsx');
const errorBoundary = read('./error.tsx');

test('route loading and error states are localized, semantic, and sanitized', () => {
  assert.match(loading, /role="status"/u);
  assert.match(loading, /aria-busy="true"/u);
  assert.match(loading, /getTranslations\('customer\.documentCenter'\)/u);
  assert.match(errorBoundary, /^'use client';/u);
  assert.match(errorBoundary, /role="alert"/u);
  assert.match(errorBoundary, /useTranslations\('customer\.documentCenter'\)/u);
  assert.match(errorBoundary, /unstable_retry/u);
  assert.doesNotMatch(errorBoundary, /error\.(?:message|digest)|console\./u);
});

test('Customer Document Center directly authorizes the linked Company before its loader', () => {
  assert.match(page, /const access = await authorizeCustomerLinkedCompanyRead\(slug\)/u);
  assert.match(page, /access\.kind === 'authorized'[\s\S]*loadCustomerDocumentCenter\(access\)/u);
  assert.doesNotMatch(page, /requireTenantRouteAccess|readSelfCustomer|listDocumentsForCompany/u);
});

test('Document Center provides one heading, four exact signals, and independent queues', () => {
  assert.equal((page.match(/<h1/gu) ?? []).length, 1);
  assert.match(page, /document-center__summary-grid/u);
  for (const key of ['awaiting', 'underReview', 'approved', 'rejected']) {
    assert.match(page, new RegExp(`summary\\.${key}`, 'u'));
  }
  assert.match(page, /workspace\.requests/u);
  assert.match(page, /workspace\.documents/u);
  assert.match(page, /kind === 'error'/u);
  assert.match(page, /kind === 'empty'/u);
  assert.match(page, /hasMore/u);
});

test('request and submitted rows expose safe workflow states without private fields or history', () => {
  assert.match(row, /instructions/u);
  assert.match(row, /dueAt/u);
  assert.match(row, /scanStatus/u);
  assert.match(row, /reviewStatus/u);
  assert.match(row, /currentVersion/u);
  assert.match(row, /mimeType/u);
  assert.match(row, /sizeBytes/u);
  assert.match(row, /rejectionReason/u);
  assert.doesNotMatch(page, /rejectionByRequest/u);
  assert.match(row, /request\.submission\.kind === 'current'/u);
  assert.match(row, /currentSubmission\?\.rejectionReason/u);
  assert.match(row, /currentSubmission\?\.reviewStatus === 'rejected'/u);
  assert.match(row, /request\.submission\.kind === 'unavailable'/u);
  assert.match(row, /UploadDocumentDialog/u);
  assert.match(row, /OpenSignedUrlButton/u);
  assert.doesNotMatch(row, /storagePath|sha256|reviewedBy|uploadedBy|VersionHistory/u);
});

test('Customer Document Center visible copy has English and Arabic parity', () => {
  assert.deepEqual(
    Object.keys(en.customer.documentCenter).sort(),
    Object.keys(ar.customer.documentCenter).sort(),
  );
});
