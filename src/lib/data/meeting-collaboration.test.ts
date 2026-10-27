import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

test('consent projection uses the newest decision for every required purpose', async () => {
  const { reduceConsentState } = await import('./meeting-collaboration');
  assert.equal(
    reduceConsentState([
      { purpose: 'recording', granted: true, withdrawn_at: null, captured_at: '2026-01-01' },
      { purpose: 'transcription', granted: true, withdrawn_at: null, captured_at: '2026-01-01' },
      { purpose: 'ai_summary', granted: true, withdrawn_at: null, captured_at: '2026-01-01' },
      {
        purpose: 'recording',
        granted: false,
        withdrawn_at: '2026-01-02',
        captured_at: '2026-01-02',
      },
    ]),
    false,
  );
  assert.equal(
    reduceConsentState([
      { purpose: 'recording', granted: true, withdrawn_at: null, captured_at: '2026-01-03' },
      { purpose: 'transcription', granted: true, withdrawn_at: null, captured_at: '2026-01-03' },
      { purpose: 'ai_summary', granted: true, withdrawn_at: null, captured_at: '2026-01-03' },
    ]),
    true,
  );
});
