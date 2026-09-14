import assert from 'node:assert/strict';
import test from 'node:test';

test('acceptance target is frozen to the dedicated loopback project', async () => {
  const contract = await import('./contract').catch(() => ({}));
  const target = 'P112_TARGET' in contract ? contract.P112_TARGET : undefined;

  assert.deepEqual(target, {
    projectId: 'mandoob-p1-12-acceptance',
    networkName: 'supabase_network_mandoob-p1-12-acceptance',
    appOrigin: 'http://127.0.0.1:3001',
    apiOrigin: 'http://127.0.0.1:56321',
    databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
    studioOrigin: 'http://127.0.0.1:56323',
    inbucketOrigin: 'http://127.0.0.1:56324',
    analyticsPort: 56327,
    poolerPort: 56329,
    inspectorPort: 56383,
    shadowPort: 56320,
    databaseContainer: 'supabase_db_mandoob-p1-12-acceptance',
  });
});
