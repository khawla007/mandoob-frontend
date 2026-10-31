import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('session middleware loads with only its public Supabase inputs', () => {
  const environment = { ...process.env };
  delete environment.NEXT_PUBLIC_APP_URL;
  delete environment.SUPABASE_SERVICE_ROLE_KEY;
  environment.NODE_ENV = 'production';
  delete environment.NEXT_PUBLIC_ROOT_DOMAIN;
  environment.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'deploy-preview-anon-key-disabled';
  environment.NEXT_PUBLIC_SUPABASE_URL = 'https://deploy-preview.invalid';

  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--conditions=react-server',
      '--input-type=module',
      '--eval',
      "await import('./src/lib/supabase/update-session.ts')",
    ],
    { cwd: process.cwd(), encoding: 'utf8', env: environment },
  );

  assert.equal(result.status, 0, result.stderr);
});
