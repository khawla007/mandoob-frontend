import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';

test('registry uses one counted RPC with every server-side selector and stable page metadata', async () => {
  const calls: unknown[] = [];
  const { listProRegistry } = await import('./pro-registry');
  const result = await listProRegistry(
    ACTOR_ID,
    {
      role: 'pro',
      q: 'Fatima',
      accountStatus: 'active',
      credentialState: 'verified',
      eligibility: 'eligible',
      assignment: 'unassigned',
      expiryWindow: '30_days',
      sort: 'credential_expiry',
      direction: 'asc',
      page: 2,
    },
    {
      supabase: {
        async rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          return {
            data: {
              items: [
                {
                  id: PRO_ID,
                  fullName: 'Fatima Noor',
                  email: null,
                  emailUnavailable: true,
                  accountStatus: 'active',
                  credentialState: 'verified',
                  credentialExpiry: '2026-09-10',
                  eligible: true,
                  eligibilityCodes: [],
                  assigned: false,
                  companyId: null,
                  companyName: null,
                  createdAt: '2026-08-01T10:00:00.000Z',
                },
              ],
              total: 26,
              page: 2,
              pageSize: 25,
              totalPages: 2,
            },
            error: null,
          };
        },
      } as never,
    },
  );
  assert.equal(result.total, 26);
  assert.equal(result.totalPages, 2);
  assert.equal(result.items[0]?.emailUnavailable, true);
  assert.deepEqual(calls, [
    {
      name: 'read_pro_registry',
      args: {
        p_actor_id: ACTOR_ID,
        p_query: 'Fatima',
        p_account_status: 'active',
        p_credential_state: 'verified',
        p_eligibility: 'eligible',
        p_assignment: 'unassigned',
        p_expiry_window: '30_days',
        p_sort: 'credential_expiry',
        p_direction: 'asc',
        p_page: 2,
        p_page_size: 25,
      },
    },
  ]);
});

test('registry rejects malformed output and sanitizes database errors', async () => {
  const { listProRegistry } = await import('./pro-registry');
  for (const response of [
    { data: { items: [], total: 1, page: 1, pageSize: 25, totalPages: 1 }, error: null },
    { data: null, error: { message: 'auth.users private failure' } },
  ]) {
    await assert.rejects(
      () =>
        listProRegistry(
          ACTOR_ID,
          { role: 'pro', sort: 'created_at', direction: 'desc', page: 1 },
          {
            supabase: {
              async rpc() {
                return response;
              },
            } as never,
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'INTERNAL' &&
        !error.message.includes('auth.users'),
    );
  }
});

test('registry migration is fixed-path, operator-only, counted, stable, and direct-grant closed', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260822130000_0074_pro_registry_reads.sql'),
    'utf8',
  );
  assert.match(sql, /create or replace function public\.read_pro_registry/u);
  assert.match(sql, /create or replace function public\.read_pro_lifecycle_detail/u);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/u);
  assert.match(
    sql,
    /role in \('admin', 'super_admin'\)[\s\S]*status = 'active'[\s\S]*tenant_id is null/u,
  );
  assert.match(sql, /pg_catalog\.count\(\*\) over \(\)/u);
  assert.match(sql, /order by[\s\S]*id/u);
  assert.match(sql, /auth\.users/u);
  assert.match(sql, /emailUnavailable/u);
  assert.match(sql, /p_page is null[\s\S]*p_page_size is distinct from 25/u);
  assert.match(sql, /p_timeline_limit is distinct from 25/u);
  assert.doesNotMatch(sql, /identifier_ciphertext|identifier_hash|storage_path/u);
  assert.match(sql, /revoke all on function public\.read_pro_registry[\s\S]*authenticated/u);
  assert.match(sql, /grant execute on function public\.read_pro_registry[\s\S]*service_role/u);
});
