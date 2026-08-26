import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

test('service-role Storage upload passes the caller abort signal to the actual fetch', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let observed: AbortSignal | null | undefined;
  globalThis.fetch = async (_input, init) => {
    observed = init?.signal;
    return new Response(
      JSON.stringify({
        Id: 'fixture',
        Key: 'tenant-documents/pro-credentials/fixture',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const { createSupabaseServiceRoleClient } = await import('./service-role');
    const { error } = await createSupabaseServiceRoleClient({ signal: controller.signal })
      .storage.from('tenant-documents')
      .upload('pro-credentials/fixture', new Uint8Array([1]), { upsert: false });
    assert.equal(error, null);
    assert.equal(observed, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
