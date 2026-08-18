import assert from 'node:assert/strict';
import test from 'node:test';

import { isNormalizedOwnedStoragePath } from './owned-path';

test('accepts only normalized paths inside the exact tenant and company scope', () => {
  assert.equal(
    isNormalizedOwnedStoragePath('tenant-1/company-1/passport/file.pdf', 'tenant-1', 'company-1'),
    true,
  );
  for (const path of [
    'tenant-1/company-2/passport/file.pdf',
    'tenant-2/company-1/passport/file.pdf',
    'tenant-1/company-1/../company-2/file.pdf',
    'tenant-1/company-1/%2e%2e/file.pdf',
    'tenant-1\\company-1\\file.pdf',
    '/tenant-1/company-1/file.pdf',
  ]) {
    assert.equal(isNormalizedOwnedStoragePath(path, 'tenant-1', 'company-1'), false, path);
  }
});

test('supports the explicit lead scope without accepting a company path', () => {
  assert.equal(
    isNormalizedOwnedStoragePath(
      'tenant-1/leads/meetings/meeting-1/recording.mp4',
      'tenant-1',
      'leads',
    ),
    true,
  );
  assert.equal(
    isNormalizedOwnedStoragePath(
      'tenant-1/company-1/meetings/meeting-1/recording.mp4',
      'tenant-1',
      'leads',
    ),
    false,
  );
});
