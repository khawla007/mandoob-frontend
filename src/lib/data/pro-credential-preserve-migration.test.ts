import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('forward save workflow preserves only an existing protected identifier and stays replay-safe', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260822160000_0077_pro_credential_blank_identifier_preservation.sql',
    ),
    'utf8',
  );
  assert.match(sql, /p_preserve_identifier boolean/u);
  assert.match(sql, /v_credential\.identifier_ciphertext is null/u);
  assert.match(sql, /v_credential\.identifier_hash is null/u);
  assert.match(sql, /v_credential\.identifier_last4 is null/u);
  assert.match(sql, /CREDENTIAL_IDENTIFIER_REQUIRED/u);
  assert.match(sql, /pro_lifecycle_replay_result/u);
  assert.match(sql, /STALE_CREDENTIAL_VERSION/u);
  assert.match(sql, /INVALID_CREDENTIAL_TRANSITION/u);
  assert.match(sql, /case when p_preserve_identifier/u);
  assert.match(sql, /elsif[\s\S]{0,240}p_identifier_hash is null/u);
  assert.match(sql, /elsif[\s\S]{0,320}p_identifier_last4 is null/u);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/u);
  assert.match(sql, /revoke all on function public\.save_pro_credential_draft/u);
  assert.match(
    sql,
    /grant execute on function public\.save_pro_credential_draft[\s\S]*service_role/u,
  );
  assert.doesNotMatch(sql, /grant execute[\s\S]*authenticated/u);
});
