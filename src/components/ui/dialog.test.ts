import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('DialogContent supports a localized close label while retaining its default', () => {
  const source = readFileSync(new URL('./dialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /closeLabel = 'Close'/);
  assert.match(source, /<span className="sr-only">\{closeLabel\}<\/span>/);
});
