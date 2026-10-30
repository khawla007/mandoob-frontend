import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createLegacyEventWorkerHandler } from '@/app/api/v1/cron/legacy-event-worker-handler';
import {
  eventRuntimeEnabled,
  legacyEventWorkersAllowed,
  parseEventRuntimeCutover,
} from './runtime-cutover';

describe('event runtime cutover', () => {
  test('uses one exact mode and keeps legacy workers available for safe rollback', () => {
    for (const value of [undefined, '', 'legacy', 'event-runtime', 'event-runtime-only ']) {
      assert.equal(parseEventRuntimeCutover(value), 'legacy');
      assert.equal(eventRuntimeEnabled(value), false);
      assert.equal(legacyEventWorkersAllowed(value), true);
    }

    assert.equal(parseEventRuntimeCutover('event-runtime-only'), 'event-runtime');
    assert.equal(eventRuntimeEnabled('event-runtime-only'), true);
    assert.equal(legacyEventWorkersAllowed('event-runtime-only'), false);
  });

  test('the same environment can never enable new and legacy event workers', () => {
    for (const value of [undefined, '', 'legacy', 'event-runtime-only', 'invalid']) {
      assert.notEqual(eventRuntimeEnabled(value), legacyEventWorkersAllowed(value));
    }
  });

  test('legacy route guard runs before worker construction', async () => {
    let workerCreated = false;
    const post = createLegacyEventWorkerHandler({
      cutoverValue: 'event-runtime-only',
      configuredSecret: '0123456789abcdef0123456789abcdef',
      run: async () => {
        workerCreated = true;
        return { processed: 1 };
      },
    });

    const response = await post(
      new Request('https://example.test/api/v1/cron/legacy', {
        method: 'POST',
        headers: { 'x-cron-secret': '0123456789abcdef0123456789abcdef' },
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: 'unavailable',
      code: 'EVENT_RUNTIME_CUTOVER_ACTIVE',
    });
    assert.equal(workerCreated, false);
  });

  test('absent cutover preserves authenticated legacy behavior for rollback', async () => {
    let workerCalls = 0;
    const secret = '0123456789abcdef0123456789abcdef';
    const post = createLegacyEventWorkerHandler({
      cutoverValue: undefined,
      configuredSecret: secret,
      run: async () => {
        workerCalls += 1;
        return { processed: 1 };
      },
    });

    const response = await post(
      new Request('https://example.test/api/v1/cron/legacy', {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { processed: 1 });
    assert.equal(workerCalls, 1);
  });

  test('every invokable legacy event route uses the shared guarded handler', () => {
    for (const route of [
      'process-outbound-emails',
      'process-outbound-sms',
      'process-outbound-whatsapp',
      'process-meeting-ai-summaries',
    ]) {
      const source = readFileSync(
        join(process.cwd(), `src/app/api/v1/cron/${route}/route.ts`),
        'utf8',
      );
      assert.match(source, /createLegacyEventWorkerHandler/u);
      assert.match(source, /cutoverValue: env\.EVENT_RUNTIME_SCHEDULER_CUTOVER/u);
    }
  });
});
