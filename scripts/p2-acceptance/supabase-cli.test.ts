import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ACCEPTANCE_EXCLUDED_MIGRATION,
  buildAcceptanceConfig,
  prepareAcceptanceWorkdir,
} from './supabase-cli';

async function withSandbox(
  run: (paths: { root: string; workdir: string; migrations: string }) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'mandoob-p2-cli-'));
  const migrations = join(root, 'source-migrations');
  const previousOptIn = process.env.P2_ACCEPTANCE_LOCAL_ONLY;
  await mkdir(migrations, { mode: 0o700 });
  await writeFile(join(migrations, '20260424051543_0001_init_auth.sql'), '-- ordinary\n');
  await writeFile(join(migrations, ACCEPTANCE_EXCLUDED_MIGRATION), '-- production recovery\n');
  process.env.P2_ACCEPTANCE_LOCAL_ONLY = '1';
  try {
    await run({ root, workdir: join(root, 'runtime'), migrations });
  } finally {
    if (previousOptIn === undefined) delete process.env.P2_ACCEPTANCE_LOCAL_ONLY;
    else process.env.P2_ACCEPTANCE_LOCAL_ONLY = previousOptIn;
    await rm(root, { recursive: true, force: true });
  }
}

function prepare(workdir: string, migrationsSource: string) {
  return prepareAcceptanceWorkdir({
    workdir,
    migrationsSource,
    baseConfig: resolve('supabase/config.toml'),
  });
}

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

test('acceptance workdir creates an owner-only per-file migration view with one exact exclusion', async () => {
  await withSandbox(async ({ workdir, migrations }) => {
    await prepare(workdir, migrations);
    await prepare(workdir, migrations);
    assert.equal((await lstat(workdir)).mode & 0o777, 0o700);
    assert.equal((await lstat(join(workdir, 'supabase'))).mode & 0o777, 0o700);
    assert.equal((await lstat(join(workdir, 'supabase/config.toml'))).mode & 0o777, 0o600);
    const runtimeMigrations = join(workdir, 'supabase/migrations');
    assert.ok((await lstat(runtimeMigrations)).isDirectory());
    assert.equal((await lstat(runtimeMigrations)).mode & 0o777, 0o700);
    assert.deepEqual(await readdir(runtimeMigrations), ['20260424051543_0001_init_auth.sql']);
    assert.ok(
      (await lstat(join(runtimeMigrations, '20260424051543_0001_init_auth.sql'))).isSymbolicLink(),
    );
    await assert.rejects(lstat(join(runtimeMigrations, ACCEPTANCE_EXCLUDED_MIGRATION)), {
      code: 'ENOENT',
    });
  });
});

test('acceptance migration view requires the exact excluded source and rejects unsafe source entries', async () => {
  await withSandbox(async ({ root, workdir, migrations }) => {
    await unlink(join(migrations, ACCEPTANCE_EXCLUDED_MIGRATION));
    await assert.rejects(prepare(workdir, migrations), /required excluded migration is missing/u);

    await writeFile(join(migrations, ACCEPTANCE_EXCLUDED_MIGRATION), '-- production recovery\n');
    const outside = join(root, 'outside.sql');
    await writeFile(outside, '-- outside\n');
    await symlink(outside, join(migrations, '20260424060000_unsafe.sql'));
    await assert.rejects(
      prepare(workdir, migrations),
      /migration source entry must be a regular file/u,
    );
  });
});

test('acceptance workdir rejects a symlink root before writing through it', async () => {
  await withSandbox(async ({ root, workdir, migrations }) => {
    const victim = join(root, 'victim');
    await mkdir(victim, { mode: 0o700 });
    await symlink(victim, workdir, 'dir');
    await assert.rejects(prepare(workdir, migrations), /unsafe runtime directory/u);
    await assert.rejects(lstat(join(victim, 'supabase')), { code: 'ENOENT' });
  });
});

test('acceptance workdir rejects final-file and migration-directory substitution', async () => {
  await withSandbox(async ({ root, workdir, migrations }) => {
    const supabase = join(workdir, 'supabase');
    await mkdir(workdir, { mode: 0o700 });
    await mkdir(supabase, { mode: 0o700 });
    const wrongMigrations = join(root, 'wrong-migrations');
    await mkdir(wrongMigrations, { mode: 0o700 });
    await symlink(wrongMigrations, join(supabase, 'migrations'), 'dir');
    await assert.rejects(prepare(workdir, migrations), /unsafe runtime directory/u);

    await rm(join(supabase, 'migrations'));
    await prepare(workdir, migrations);
    const victim = join(root, 'victim.txt');
    await writeFile(victim, 'do not overwrite', { mode: 0o600 });
    await unlink(join(supabase, 'config.toml'));
    await symlink(victim, join(supabase, 'config.toml'));
    await assert.rejects(prepare(workdir, migrations), { code: 'ELOOP' });
    assert.equal(await readFile(victim, 'utf8'), 'do not overwrite');
  });
});

test('the acceptance exclusion is fixed and cannot be selected by callers', () => {
  assert.equal(
    ACCEPTANCE_EXCLUDED_MIGRATION,
    '20260915090000_0087_reconcile_existing_pro_access.sql',
  );
  assert.equal(prepareAcceptanceWorkdir.length, 0);
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
