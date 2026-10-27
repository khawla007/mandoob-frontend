import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { EVENT_RUNTIME_CADENCE_DISPOSITION, createProcessEventJobsHandler } from './route-handler';

describe('event worker cron owner', () => {
  test('fails closed for missing, short, or incorrect secrets', async () => {
    for (const [configuredSecret, suppliedSecret] of [
      [undefined, 'anything'],
      ['', 'anything'],
      ['short', 'short'],
      ['0123456789abcdef0123456789abcdef', 'fedcba9876543210fedcba9876543210'],
    ] as const) {
      let called = false;
      const post = createProcessEventJobsHandler({
        configuredSecret,
        consumers: ['internal.safe.projection'],
        runConsumer: async () => {
          called = true;
          return { claimed: 0, succeeded: 0, failed: 0, leaseLost: 0 };
        },
      });
      const response = await post(
        new Request('https://example.test/api/v1/cron/process-event-jobs', {
          method: 'POST',
          headers: { 'x-cron-secret': suppliedSecret },
        }),
      );
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'unauthorized' });
      assert.equal(called, false);
    }
  });

  test('runs only the explicit bounded consumer list and returns generic counts', async () => {
    const calls: Array<{ consumer: string; owner: string; batchSize: number }> = [];
    const secret = '0123456789abcdef0123456789abcdef';
    const post = createProcessEventJobsHandler({
      configuredSecret: secret,
      consumers: ['internal.one.projection', 'internal.two.projection'],
      runConsumer: async (consumer, options) => {
        calls.push({ consumer, ...options });
        if (consumer === 'internal.two.projection') throw new Error('private database detail');
        return { claimed: 1, succeeded: 1, failed: 0, leaseLost: 0 };
      },
    });
    const response = await post(
      new Request('https://example.test/api/v1/cron/process-event-jobs', {
        method: 'POST',
        headers: { 'x-cron-secret': secret },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(calls, [
      { consumer: 'internal.one.projection', owner: 'netlify.event-runtime', batchSize: 25 },
      { consumer: 'internal.two.projection', owner: 'netlify.event-runtime', batchSize: 25 },
    ]);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, consumers: 2, completed: 1, unavailable: 1 });
    assert.equal(JSON.stringify(body).includes('private database detail'), false);
  });

  test('uses timing-safe comparison and cannot invoke legacy or provider-disabled workers', () => {
    const source = readFileSync(join(__dirname, 'route-handler.ts'), 'utf8');
    const route = readFileSync(join(__dirname, 'route.ts'), 'utf8');
    assert.match(source, /timingSafeEqual/u);
    assert.match(route, /scheduledRuntimeConsumers/u);
    assert.doesNotMatch(
      route,
      /processOutboundEmails|processOutboundSms|processOutboundWhatsApp|processMeetingAiJobs/u,
    );
  });

  test('records unavailable scheduler cadence as launch-blocking without enabling a schedule', () => {
    assert.deepEqual(EVENT_RUNTIME_CADENCE_DISPOSITION, {
      configured: false,
      status: 'launch-blocking',
      reason: 'DEPLOY_SCHEDULE_NOT_APPROVED',
    });
  });
});
