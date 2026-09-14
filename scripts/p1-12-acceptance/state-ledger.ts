import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { P112_FROZEN_STATE_OWNERSHIP } from './tier-a-manifest';

export function buildP112StateOwnershipLedger(generatedAt = new Date().toISOString()) {
  const states = P112_FROZEN_STATE_OWNERSHIP.map((state) => ({ ...state }));
  return {
    schemaVersion: 1,
    generatedAt,
    summary: {
      total: states.length,
      tierARoute: states.filter(({ execution }) => execution === 'tier-a-route').length,
      tierCBrowser: states.filter(({ execution }) => execution === 'tier-c-browser').length,
      sourceRegression: states.filter(({ execution }) => execution === 'source-regression').length,
    },
    states,
  };
}

async function main(): Promise<void> {
  const output = process.argv[2];
  if (!output || !output.endsWith('/state-ownership-ledger.json')) {
    throw new Error('P1.12 state ledger output path rejected');
  }
  await writeFile(
    resolve(output),
    `${JSON.stringify(buildP112StateOwnershipLedger(), null, 2)}\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  main().catch(() => {
    process.stderr.write('P1.12 state ledger generation failed.\n');
    process.exitCode = 1;
  });
}
