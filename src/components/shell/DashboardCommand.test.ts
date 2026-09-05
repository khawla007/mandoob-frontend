import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Find a page command has a keyboard shortcut, labelled dialog, and empty state', () => {
  const source = readFileSync(new URL('./DashboardCommand.tsx', import.meta.url), 'utf8');
  assert.match(source, /event\.key\.toLowerCase\(\) === 'k'/u);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/u);
  assert.match(source, /<CommandDialog[\s\S]*title=\{t\('findPage'\)\}/u);
  assert.match(source, /<CommandEmpty>\{t\('noPagesFound'\)\}<\/CommandEmpty>/u);
  assert.match(source, /router\.push\(href\)/u);
  assert.doesNotMatch(source, /global search|records|entities/iu);
});

test('Find a page command consumes the shared typed navigation source', () => {
  const source = readFileSync(new URL('./DashboardCommand.tsx', import.meta.url), 'utf8');
  assert.match(source, /resolveDashboardNav\(navKind, navSlug\)/u);
  assert.match(source, /buildDashboardCommandEntries/u);
  assert.doesNotMatch(source, /const\s+(routes|items)\s*=\s*\[/u);
});
