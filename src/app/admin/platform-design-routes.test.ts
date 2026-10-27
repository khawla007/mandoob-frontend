import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

// `questionnaire` graduated to a live P3.05 surface (AAL2 admin editor with real reads),
// so it no longer follows the read-free platform-design placeholder contract.
const routes = ['reports', 'compliance', 'system-status', 'plans'] as const;

for (const route of routes) {
  test(`/admin/${route} directly authorizes without production fixtures or provider reads`, () => {
    const source = readFileSync(join(process.cwd(), `src/app/admin/${route}/page.tsx`), 'utf8');
    const guard = source.indexOf('await requirePlatformOperator()');
    const render = source.indexOf('return (');

    assert.ok(guard >= 0, 'missing direct platform-operator authorization');
    assert.ok(render > guard, 'authorization must precede rendering');
    assert.doesNotMatch(source, /createSupabase|serviceRole|fixture|mock|Math\.random/iu);
    assert.doesNotMatch(source, /const\s+(rows|items|records|plans|questions)\s*=\s*\[/u);
  });
}
