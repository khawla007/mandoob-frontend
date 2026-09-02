import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const page = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/employees/page.tsx'),
  'utf8',
);
const en = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8'));
const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar.json'), 'utf8'));

test('employee registry exposes source-backed filters, compact signals, and safe states', () => {
  assert.match(page, /parseEmployeeRegistrySearch/u);
  assert.match(page, /EmployeeRegistryFilters/u);
  assert.match(page, /EmployeeRegistrySignals/u);
  assert.match(page, /EmployeeRegistryTable/u);
  assert.match(page, /emptyFiltered/u);
  assert.match(page, /unavailable/u);
  assert.match(page, /partial/u);
  assert.match(page, /sanitizedError/u);
});

test('employee registry and import copy have exact English and Arabic leaf parity', () => {
  const leaves = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) =>
          leaves(child, prefix ? `${prefix}.${key}` : key),
        )
      : [prefix];
  assert.deepEqual(leaves(en.pro.employeeRegistry).sort(), leaves(ar.pro.employeeRegistry).sort());
  assert.deepEqual(leaves(en.pro.employeeImport).sort(), leaves(ar.pro.employeeImport).sort());
  assert.deepEqual(leaves(en.pro.importJob).sort(), leaves(ar.pro.importJob).sort());
});
