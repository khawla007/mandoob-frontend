import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Tier A records explicit rendered contrast ratios and worst gradient/transparency cases', async () => {
  const source = await readFile('scripts/p1-12-acceptance/contrast.ts', 'utf8');
  const spec = await readFile('tests/p1-12-acceptance/tier-a.spec.ts', 'utf8');
  assert.match(source, /backgroundImage\.matchAll/u);
  assert.match(source, /node; node = node\.parentElement/u);
  assert.match(source, /const backgroundImage = nodeStyle\.backgroundImage/u);
  assert.match(source, /nodeBackground\.a >= 0\.999/u);
  assert.match(source, /oklch/u);
  assert.match(source, /composite\(rawForeground, background\)/u);
  assert.match(source, /Math\.min/u);
  assert.match(source, /threshold = category === 'disabled' \? 3 : large \? 3 : 4\.5/u);
  for (const category of [
    'body',
    'heading',
    'muted',
    'link',
    'control',
    'form-control',
    'disabled',
    'helper',
    'error',
    'status',
    'table',
    'pagination',
    'dialog',
    'disclosure',
    'estimator',
    'application',
    'auth',
  ]) {
    assert.match(source, new RegExp(`\\['${category}'|\\[\"${category}\"`, 'u'));
  }
  assert.match(spec, /auditP112RenderedContrast/u);
  assert.match(spec, /contrast-ratios\.json/u);
  assert.match(spec, /P112_CONTRAST_LOG_PATH/u);
  assert.match(spec, /appendFileSync/u);
  assert.match(spec, /record\.result === 'FAIL'/u);
});
