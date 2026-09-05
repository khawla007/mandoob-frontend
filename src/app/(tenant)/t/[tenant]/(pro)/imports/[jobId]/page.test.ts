import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const page = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/imports/[jobId]/page.tsx'),
  'utf8',
);
const en = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8'));
const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar.json'), 'utf8'));
const actions = readFileSync(join(root, 'src/components/pro/BulkImportJobActions.tsx'), 'utf8');

test('import job page scopes service-role reads through the live assigned company', () => {
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/);
  assert.match(page, /\.eq\('tenant_id', tenant\.id\)/);
  assert.match(page, /\.eq\('company_id', company\.id\)/);
  assert.match(page, /\.eq\('id', jobId\)/);
});

test('import job page localizes every visible operational value and formats Dubai time explicitly', () => {
  assert.match(page, /getTranslations\('pro\.importJob'\)/);
  assert.match(page, /getLocale\(\)/);
  assert.match(page, /new Intl\.DateTimeFormat\(locale/);
  assert.match(page, /timeZone: 'Asia\/Dubai'/);
  assert.match(page, /safeImportJobStatus\(job\.status\)/);
  assert.match(page, /safeImportErrorCode\(error\.code\)/);
  assert.match(page, /safeImportField\(error\.field\)/);
  assert.doesNotMatch(page, /\{error\.message\}|\{job\.status\}|toLocaleString\(\)/);
});

test('import job messages have exact English and Arabic parity', () => {
  const leafPaths = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object'
      ? Object.entries(value).flatMap(([key, child]) =>
          leafPaths(child, prefix ? `${prefix}.${key}` : key),
        )
      : [prefix];
  assert.deepEqual(leafPaths(ar.pro.importJob).sort(), leafPaths(en.pro.importJob).sort());
});

test('import cancellation identifies its target and requires explicit confirmation', () => {
  assert.match(actions, /cancelConfirmationOpen/u);
  assert.match(actions, /<Dialog/u);
  assert.match(actions, /labels\.cancelPrompt/u);
  assert.match(page, /cancelPrompt: t\('cancelPrompt'/u);
  assert.doesNotMatch(actions, /text-emerald-/u);
  assert.match(actions, /text-\[var\(--signal-success\)\]/u);
});
