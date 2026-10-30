import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import importedConfig from '../../next.config';

type ResolvedConfig = {
  default?: ResolvedConfig;
  outputFileTracingRoot?: string;
  turbopack?: {
    root?: string;
  };
};

function unwrapConfig(config: ResolvedConfig): ResolvedConfig {
  let current = config;

  while (current.default && Object.keys(current).length === 1) {
    current = current.default;
  }

  return current;
}

test('pins build and tracing roots to this checkout', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const config = unwrapConfig(importedConfig as ResolvedConfig);

  assert.equal(config.turbopack?.root, projectRoot);
  assert.equal(config.outputFileTracingRoot, projectRoot);
});

test('uses the verified production compiler for the standard build command', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: { build?: string };
  };

  assert.equal(packageJson.scripts?.build, 'next build --webpack');
});
