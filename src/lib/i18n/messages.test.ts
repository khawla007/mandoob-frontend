import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

function shellKeysFromNavSources() {
  const keys = new Set<string>();
  for (const file of ['nav-admin.ts', 'nav-pro.ts', 'nav-employee.ts']) {
    const source = readFileSync(join(process.cwd(), 'src/lib/shell', file), 'utf8');
    for (const match of source.matchAll(/labelKey:\s*'([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

describe('i18n/messages', () => {
  it('defines shell messages for every dashboard nav label', () => {
    const keys = shellKeysFromNavSources();

    for (const key of keys) {
      assert.ok(key in en.shell, `Missing en.shell.${key}`);
      assert.ok(key in ar.shell, `Missing ar.shell.${key}`);
    }
  });
});
