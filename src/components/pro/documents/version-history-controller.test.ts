import assert from 'node:assert/strict';
import test from 'node:test';

test('history controller reloads on every open and ignores a late result from an earlier generation', async () => {
  let loaded: typeof import('./version-history-controller') | undefined;
  try {
    loaded = await import('./version-history-controller');
  } catch {}
  assert.ok(loaded);
  if (!loaded) return;

  const resolvers: Array<(value: string) => void> = [];
  const applied: string[] = [];
  const pending: boolean[] = [];
  let loadCalls = 0;
  const controller = loaded.createVersionHistoryController({
    load: () => {
      loadCalls += 1;
      return new Promise<string>((resolve) => resolvers.push(resolve));
    },
    apply: (value) => applied.push(value),
    setPending: (value) => pending.push(value),
  });

  const first = controller.open();
  controller.close();
  const second = controller.open();
  assert.equal(loadCalls, 2);

  resolvers[0]('stale');
  await first;
  assert.deepEqual(applied, []);

  resolvers[1]('fresh');
  await second;
  assert.deepEqual(applied, ['fresh']);
  assert.deepEqual(pending, [true, false, true, false]);
});

test('closing history invalidates an in-flight response', async () => {
  const { createVersionHistoryController } = await import('./version-history-controller');
  let resolve: ((value: string) => void) | undefined;
  let applied = false;
  const controller = createVersionHistoryController({
    load: () => new Promise<string>((done) => (resolve = done)),
    apply: () => {
      applied = true;
    },
    setPending: () => undefined,
  });
  const request = controller.open();
  controller.close();
  resolve?.('late');
  await request;
  assert.equal(applied, false);
});

test('history creates one reusable formatter set for a locale', async () => {
  const { createVersionHistoryFormatters } = await import('./version-history-controller');
  const formatters = createVersionHistoryFormatters('ar-AE');
  const timestamp = new Date('2026-08-14T08:00:00.000Z');

  assert.equal(
    formatters.timestamp.format(timestamp),
    new Intl.DateTimeFormat('ar-AE', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    }).format(timestamp),
  );
  assert.equal(formatters.integer.format(12), new Intl.NumberFormat('ar-AE').format(12));
  assert.equal(
    formatters.decimal.format(1.25),
    new Intl.NumberFormat('ar-AE', { maximumFractionDigits: 1 }).format(1.25),
  );
});
