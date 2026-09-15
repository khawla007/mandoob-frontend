import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const relative of ['./blog/actions.ts', './pages/actions.ts', './cost-data/actions.ts']) {
  test(`${relative} requires fresh role/status and AAL2 inside the server-action boundary`, () => {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /const session = await requireRole\('super_admin', 'admin'\);/u);
    assert.match(source, /await requireAal2\(session\);/u);
    assert.ok(
      source.indexOf("await requireRole('super_admin', 'admin')") <
        source.indexOf('await requireAal2(session)'),
    );
  });
}
