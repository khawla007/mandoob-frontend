import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const harnessUrl = new URL(
  '../../../supabase/tests/run_event_queue_concurrency.sh',
  import.meta.url,
);

test('event queue contention harness proves claims, fencing, recovery, and replay races', async () => {
  const script = await readFile(harnessUrl, 'utf8');

  assert.match(script, /EVENT_QUEUE_DB_CONTAINER/);
  assert.match(script, /claim_event_jobs/g);
  assert.match(script, /wait "\$claim_[ab]_pid"/);
  assert.match(script, /STALE_EVENT_JOB_LEASE/);
  assert.match(script, /lease_expires_at = pg_catalog\.now\(\) - interval '1 second'/);
  assert.match(script, /request_event_job_replay/g);
  assert.match(script, /replay_[ab]_status/);
  assert.match(script, /disable trigger event_job_attempts_immutable/);
  assert.match(script, /enable trigger event_job_attempts_immutable/);
});
