import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916020200_0090_official_uae_launch_catalog.sql',
  import.meta.url,
);

test('the launch catalog is approved, source-attributed, current, and excludes demo estimates', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /official-uae-launch-catalog/i);
  assert.match(sql, /status[\s\S]*published/i);
  assert.match(sql, /approved_at[\s\S]*2026-09-16/i);
  assert.match(sql, /https:\/\/u\.ae\/en\/information-and-services\/business/i);

  for (const authority of [
    'dmcc',
    'jafza',
    'ifza',
    'rakez',
    'shams',
    'meydan-free-zone',
    'rak-icc',
    'jebel-ali-offshore',
  ]) {
    assert.match(sql, new RegExp(`'${authority}'`, 'i'));
  }

  for (const amountMinor of [3548400, 500000, 1400000, 575000, 1250000, 1000000]) {
    assert.match(sql, new RegExp(String(amountMinor)));
  }

  assert.match(sql, /price_state[\s\S]*on_request/i);
  assert.match(sql, /eligibility_state[\s\S]*approval_required/i);
  assert.match(sql, /source_id[\s\S]*catalog_version_id[\s\S]*catalog_authority_id/i);
  assert.doesNotMatch(sql, /seededCostDataRows|estimate-grade public planning data/i);
});
