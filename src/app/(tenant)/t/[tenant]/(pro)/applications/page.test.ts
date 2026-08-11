import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const pagePath = join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx');
const tablePath = join(process.cwd(), 'src/components/pro/applications/ApplicationsTable.tsx');

test('applications page awaits route inputs, validates stable filters, and parallelizes reads', () => {
  const source = readFileSync(pagePath, 'utf8');
  assert.match(source, /params:\s*Promise<\{ tenant: string \}>/);
  assert.match(source, /searchParams:\s*Promise</);
  assert.match(source, /await params/);
  assert.match(source, /await searchParams/);
  assert.match(source, /serviceCaseFilterSchema\.safeParse/);
  assert.match(source, /status[^\n]+split\(','\)/);
  assert.match(source, /assigned_to:\s*search\.owner/);
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /listServiceCases\(/);
  assert.match(source, /listServiceCaseClients\(/);
  assert.match(source, /listServiceCaseOwners\(/);
});

test('applications workspace uses native accessible forms and the required table contract', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  assert.match(page, /<form[^>]+method="get"/);
  assert.match(page, /<form[^>]+action=/);
  assert.match(page, /<label/);
  for (const heading of ['client', 'service', 'status', 'owner', 'slaDue', 'action']) {
    assert.match(table, new RegExp(`labels\\.${heading}`));
  }
  assert.match(table, /focus-visible:ring/);
  assert.match(table, /updateApplicationAction\.bind/);
});
