#!/usr/bin/env tsx

process.stderr.write(
  'scripts/seed-auth.ts is unsupported for P2.12 acceptance.\n' +
    'Use the guarded fixture tool instead:\n' +
    'P2_ACCEPTANCE_LOCAL_ONLY=1 npx tsx scripts/p2-acceptance/fixture.ts setup\n',
);
process.exitCode = 1;
