import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('all committed SQL fixture assertions exit nonzero portably on PostgreSQL 17', () => {
  const fixtureDir = join(process.cwd(), 'supabase/tests');
  const fixtureNames = readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of fixtureNames) {
    const sql = readFileSync(join(fixtureDir, name), 'utf8');
    assert.doesNotMatch(sql, /\\quit(?:\s+[^\r\n]+)?/u, `${name} uses non-portable \\quit`);

    for (const branch of sql.matchAll(/\\else([\s\S]*?)\\endif/gu)) {
      assert.match(
        branch[1],
        /\\set\s+ON_ERROR_STOP\s+on[\s\S]*?(?:raise\s+exception|select\s+1\s*\/\s*0)/u,
        `${name} has a failure branch that can exit zero`,
      );
    }
  }
});
