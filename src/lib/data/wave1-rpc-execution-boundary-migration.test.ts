import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916025900_0091_wave1_rpc_execution_boundary.sql',
  import.meta.url,
);

test('Wave 1 RPCs revoke explicit client grants while retaining only service-role execution', () => {
  assert.ok(existsSync(migrationUrl), 'forward RPC execution-boundary migration is required');

  const statements = readFileSync(migrationUrl, 'utf8')
    .replace(/--[^\n]*/gu, '')
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/gu, ' ').toLowerCase())
    .filter(Boolean);
  const signatures = [
    'mutate_cost_data(uuid, uuid, text, uuid, bigint, jsonb)',
    'import_cost_data(uuid, uuid, jsonb)',
    'mutate_editorial_content(uuid, uuid, text, text, uuid, bigint, jsonb)',
  ];

  assert.deepEqual(
    statements,
    signatures.flatMap((signature) => [
      `revoke all on function public.${signature} from public, anon, authenticated`,
      `grant execute on function public.${signature} to service_role`,
    ]),
    'revoke PUBLIC and both explicit Supabase client grants on exactly the three RPC signatures',
  );
});
