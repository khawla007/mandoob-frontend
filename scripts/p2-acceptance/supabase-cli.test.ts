import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildAcceptanceConfig } from './supabase-cli';

test('acceptance config is derived without changing ordinary development defaults', () => {
  const ordinary = readFileSync('supabase/config.toml', 'utf8');
  const acceptance = buildAcceptanceConfig(ordinary);
  assert.match(ordinary, /project_id = "mandoob"/u);
  assert.match(ordinary, /port = 54321/u);
  assert.match(ordinary, /enroll_enabled = false/u);
  assert.match(acceptance, /project_id = "mandoob-p2-12-acceptance"/u);
  assert.match(acceptance, /port = 56021/u);
  assert.match(acceptance, /enroll_enabled = true/u);
});

test('fixture tools resolve the CLI portably and observe target identity state', () => {
  const cli = readFileSync('scripts/p2-acceptance/supabase-cli.ts', 'utf8');
  const fixture = readFileSync('scripts/p2-acceptance/fixture.ts', 'utf8');
  const app = readFileSync('scripts/p2-acceptance/run-app.ts', 'utf8');
  assert.match(cli, /process\.env\.SUPABASE_CLI\?\.trim\(\) \|\| 'supabase'/u);
  assert.doesNotMatch(`${fixture}\n${app}`, /\/home\/[^'"\s]+\/supabase/u);
  assert.match(app, /listIdentityEmails/u);
  assert.match(app, /actualProjectId: configuredProject/u);
  assert.match(app, /unexpectedIdentityCount,/u);
  assert.doesNotMatch(app, /actualProjectId: PROJECT_ID|unexpectedIdentityCount: 0/u);
});

test('teardown proves the exact reusable fixture before stopping its isolated project', () => {
  const fixture = readFileSync('scripts/p2-acceptance/fixture.ts', 'utf8');
  const teardown = fixture.slice(fixture.indexOf("if (action === 'teardown')"));
  assert.ok(teardown.indexOf('assertReusableFixture(') < teardown.indexOf("runSupabase(['stop'"));
  assert.ok(
    teardown.indexOf('assertReusableFixtureSnapshot(') < teardown.indexOf("runSupabase(['stop'"),
  );
  assert.doesNotMatch(teardown, /runSupabase\(\['db', 'reset'/u);
});
