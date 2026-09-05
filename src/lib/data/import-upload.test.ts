import assert from 'node:assert/strict';
import test from 'node:test';

import { uploadAndCreateBulkImportJob } from './import-upload';

test('a bulk-import job insert failure removes the just-uploaded CSV before returning failure', async () => {
  const removed: string[][] = [];
  const result = await uploadAndCreateBulkImportJob({
    storagePath: 'tenant-1/job-1.csv',
    upload: async () => ({ error: null }),
    createJob: async () => ({ error: new Error('insert failed') }),
    remove: async (paths) => {
      removed.push(paths);
      return { error: null };
    },
    logCleanupFailure: () => assert.fail('cleanup should not fail'),
  });

  assert.equal(result, 'job_insert_failed');
  assert.deepEqual(removed, [['tenant-1/job-1.csv']]);
});
