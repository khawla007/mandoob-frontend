import assert from 'node:assert/strict';
import test from 'node:test';

import {
  withDevelopmentCollectionEvidence,
  withDevelopmentItemEvidence,
} from './development-evidence';

test('production always uses the real collection and item loaders', async () => {
  const collection = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'production',
    mode: 'empty',
  });
  const item = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'production',
    mode: 'fixture',
    fixture: 'synthetic',
  });

  assert.deepEqual(await collection(), ['real']);
  assert.equal(await item('slug'), 'real');
});

test('development collection evidence can model empty and unavailable without mutation', async () => {
  const empty = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'development',
    mode: 'empty',
  });
  const unavailable = withDevelopmentCollectionEvidence(async () => ['real'], {
    nodeEnv: 'development',
    mode: 'unavailable',
  });

  assert.deepEqual(await empty(), []);
  await assert.rejects(unavailable, /isolated development evidence/u);
});

test('development item evidence can model fixture, missing, and unavailable reads', async () => {
  const fixture = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'fixture',
    fixture: 'reviewed fixture',
  });
  const missing = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'missing',
  });
  const unavailable = withDevelopmentItemEvidence(async (slug: string) => (slug ? 'real' : null), {
    nodeEnv: 'development',
    mode: 'unavailable',
  });

  assert.equal(await fixture('slug'), 'reviewed fixture');
  assert.equal(await missing('slug'), null);
  await assert.rejects(() => unavailable('slug'), /isolated development evidence/u);
});
