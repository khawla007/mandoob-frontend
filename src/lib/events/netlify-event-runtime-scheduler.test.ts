import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  EVENT_RUNTIME_SCHEDULE,
  EVENT_RUNTIME_SCHEDULER_OWNER,
  createScheduledEventRuntimeHandler,
} from '../../../netlify/functions/process-event-jobs';
import { EVENT_RUNTIME_CADENCE_DISPOSITION } from '../../app/api/v1/cron/process-event-jobs/route-handler';

const validEnv = {
  EVENT_RUNTIME_SCHEDULER_CUTOVER: 'event-runtime-only',
  URL: 'https://mandoob.example',
  CRON_SECRET: '0123456789abcdef0123456789abcdef',
};

describe('Netlify event runtime scheduler', () => {
  test('accepts an indexed process environment while missing runtime keys stay disabled', async () => {
    const environment: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    let called = false;
    const logs: string[] = [];
    const handler = createScheduledEventRuntimeHandler({
      environment,
      log: (code) => logs.push(code),
      fetch: async () => {
        called = true;
        return new Response(null, { status: 200 });
      },
    });

    const response = await handler();
    assert.equal(response.status, 204);
    assert.equal(called, false);
    assert.deepEqual(logs, ['EVENT_RUNTIME_SCHEDULER_DISABLED']);
  });

  test('checks in one UTC cadence owned only by the event runtime', () => {
    assert.equal(EVENT_RUNTIME_SCHEDULER_OWNER, 'netlify.event-runtime');
    assert.equal(EVENT_RUNTIME_SCHEDULE, '*/5 * * * *');
    assert.equal(EVENT_RUNTIME_CADENCE_DISPOSITION.owner, EVENT_RUNTIME_SCHEDULER_OWNER);
    assert.equal(EVENT_RUNTIME_CADENCE_DISPOSITION.cadence, EVENT_RUNTIME_SCHEDULE);

    const functionsDirectory = join(process.cwd(), 'netlify/functions');
    const scheduledFunctions = readdirSync(functionsDirectory, {
      encoding: 'utf8',
      recursive: true,
    })
      .filter((name) => /\.(?:ts|mts|js|mjs)$/u.test(name))
      .filter((name) => {
        const source = readFileSync(join(functionsDirectory, name), 'utf8');
        return /export const config\s*=\s*\{[\s\S]{0,300}\bschedule\s*:/u.test(source);
      })
      .sort();

    assert.deepEqual(scheduledFunctions, []);
    const netlifyConfig = readFileSync(join(process.cwd(), 'netlify.toml'), 'utf8');
    assert.match(netlifyConfig, /\[functions\."process-event-jobs"\]/u);
    assert.match(netlifyConfig, /schedule\s*=\s*"\*\/5 \* \* \* \*"/u);
  });

  test('fails closed unless the exclusive cutover selector, URL, and secret are valid', async () => {
    const invalidEnvironments = [
      { ...validEnv, EVENT_RUNTIME_SCHEDULER_CUTOVER: undefined },
      { ...validEnv, EVENT_RUNTIME_SCHEDULER_CUTOVER: 'legacy' },
      { ...validEnv, URL: 'http://mandoob.example' },
      { ...validEnv, URL: 'https://user:password@mandoob.example' },
      { ...validEnv, CRON_SECRET: 'short' },
    ];

    for (const environment of invalidEnvironments) {
      let called = false;
      const logs: string[] = [];
      const handler = createScheduledEventRuntimeHandler({
        environment,
        log: (code) => logs.push(code),
        fetch: async () => {
          called = true;
          return new Response(null, { status: 200 });
        },
      });

      const response = await handler();
      assert.equal(called, false);
      assert.equal(response.status, 204);
      assert.equal(await response.text(), '');
      assert.deepEqual(logs, [
        environment.EVENT_RUNTIME_SCHEDULER_CUTOVER === 'event-runtime-only'
          ? 'EVENT_RUNTIME_SCHEDULER_CONFIG_INVALID'
          : 'EVENT_RUNTIME_SCHEDULER_DISABLED',
      ]);
    }
  });

  test('posts only to the exact internal route with the secret and a bounded signal', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const logs: string[] = [];
    const handler = createScheduledEventRuntimeHandler({
      environment: { ...validEnv, URL: 'https://mandoob.example/' },
      fetch: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return Response.json({ ok: true, consumers: 4, completed: 4, unavailable: 0 });
      },
      timeoutMs: 15,
      log: (code) => logs.push(code),
    });

    const response = await handler();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: 'completed' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://mandoob.example/api/v1/cron/process-event-jobs');
    assert.equal(calls[0]?.init.method, 'POST');
    assert.equal(new Headers(calls[0]?.init.headers).get('x-cron-secret'), validEnv.CRON_SECRET);
    assert.ok(calls[0]?.init.signal instanceof AbortSignal);
    assert.deepEqual(logs, ['EVENT_RUNTIME_SCHEDULER_SUCCESS']);
  });

  test('sanitizes upstream bodies, thrown details, and non-success results', async () => {
    for (const fetch of [
      async () => new Response('private upstream detail', { status: 503 }),
      async () => {
        throw new Error('private network detail');
      },
    ]) {
      const logs: string[] = [];
      const handler = createScheduledEventRuntimeHandler({
        environment: validEnv,
        fetch,
        log: (code) => logs.push(code),
      });
      const response = await handler();
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.deepEqual(body, { ok: false, status: 'unavailable' });
      assert.doesNotMatch(JSON.stringify(body), /private|network|upstream/u);
      assert.deepEqual(logs, ['EVENT_RUNTIME_SCHEDULER_UPSTREAM_UNAVAILABLE']);
    }
  });

  test('aborts an in-flight internal request at the local deadline', async () => {
    let observedAbort = false;
    const logs: string[] = [];
    const handler = createScheduledEventRuntimeHandler({
      environment: validEnv,
      timeoutMs: 1,
      log: (code) => logs.push(code),
      fetch: async (_input, init) => {
        await new Promise<void>((resolve) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              observedAbort = true;
              resolve();
            },
            { once: true },
          );
        });
        throw new Error('deadline');
      },
    });

    const response = await handler();
    assert.equal(observedAbort, true);
    assert.equal(response.status, 503);
    assert.deepEqual(logs, ['EVENT_RUNTIME_SCHEDULER_UPSTREAM_UNAVAILABLE']);
  });

  test('does not schedule legacy or provider cron routes', () => {
    const scheduler = readFileSync(
      join(process.cwd(), 'netlify/functions/process-event-jobs.ts'),
      'utf8',
    );
    assert.match(scheduler, /\/api\/v1\/cron\/process-event-jobs/u);
    assert.doesNotMatch(
      scheduler,
      /process-outbound-emails|process-outbound-sms|process-outbound-whatsapp|process-meeting-ai-summaries/u,
    );
  });
});
