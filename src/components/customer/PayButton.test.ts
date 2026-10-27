import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/components/customer/PayButton.tsx'), 'utf8');

test('PayButton preserves its operation UUID across ambiguous retries', () => {
  assert.match(source, /useRef<string \| null>/u);
  assert.match(source, /operationRef\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(source, /operationId: operationRef\.current/u);
  assert.match(source, /result\.code !== 'UNAVAILABLE'/u);
  assert.doesNotMatch(source, /operationId: crypto\.randomUUID\(\)/u);
});
