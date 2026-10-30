import { eventRuntimeEnabled } from '../../src/lib/events/runtime-cutover';

export const EVENT_RUNTIME_SCHEDULER_OWNER = 'netlify.event-runtime' as const;
export const EVENT_RUNTIME_SCHEDULE = '*/5 * * * *' as const;
export const config = { schedule: EVENT_RUNTIME_SCHEDULE } as const;

const PROCESS_EVENT_JOBS_PATH = '/api/v1/cron/process-event-jobs';
const DEFAULT_TIMEOUT_MS = 20_000;

type SchedulerEnvironment = Readonly<Record<string, string | undefined>>;

export type EventRuntimeSchedulerLogCode =
  | 'EVENT_RUNTIME_SCHEDULER_DISABLED'
  | 'EVENT_RUNTIME_SCHEDULER_CONFIG_INVALID'
  | 'EVENT_RUNTIME_SCHEDULER_UPSTREAM_UNAVAILABLE'
  | 'EVENT_RUNTIME_SCHEDULER_SUCCESS';

type RuntimeConfiguration =
  | { status: 'disabled' | 'invalid' }
  | { status: 'ready'; url: URL; secret: string };

function resolveRuntimeConfiguration(environment: SchedulerEnvironment): RuntimeConfiguration {
  if (!eventRuntimeEnabled(environment.EVENT_RUNTIME_SCHEDULER_CUTOVER)) {
    return { status: 'disabled' };
  }
  if (!environment.CRON_SECRET || environment.CRON_SECRET.length < 32) {
    return { status: 'invalid' };
  }

  try {
    const baseUrl = new URL(environment.URL ?? '');
    if (
      baseUrl.protocol !== 'https:' ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.pathname !== '/' ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      return { status: 'invalid' };
    }
    return {
      status: 'ready',
      url: new URL(PROCESS_EVENT_JOBS_PATH, baseUrl),
      secret: environment.CRON_SECRET,
    };
  } catch {
    return { status: 'invalid' };
  }
}

export function createScheduledEventRuntimeHandler(input: {
  environment: SchedulerEnvironment;
  fetch: typeof globalThis.fetch;
  log?: (code: EventRuntimeSchedulerLogCode) => void;
  timeoutMs?: number;
}): () => Promise<Response> {
  return async () => {
    const configuration = resolveRuntimeConfiguration(input.environment);
    const log = input.log ?? ((code: EventRuntimeSchedulerLogCode) => console.info(code));
    if (configuration.status !== 'ready') {
      log(
        configuration.status === 'disabled'
          ? 'EVENT_RUNTIME_SCHEDULER_DISABLED'
          : 'EVENT_RUNTIME_SCHEDULER_CONFIG_INVALID',
      );
      return new Response(null, { status: 204 });
    }

    const controller = new AbortController();
    const timeoutMs = Math.min(
      Math.max(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1),
      DEFAULT_TIMEOUT_MS,
    );
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await input.fetch(configuration.url, {
        method: 'POST',
        headers: { 'x-cron-secret': configuration.secret },
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('EVENT_RUNTIME_UNAVAILABLE');
      log('EVENT_RUNTIME_SCHEDULER_SUCCESS');
      return Response.json({ ok: true, status: 'completed' });
    } catch {
      log('EVENT_RUNTIME_SCHEDULER_UPSTREAM_UNAVAILABLE');
      return Response.json({ ok: false, status: 'unavailable' }, { status: 503 });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createScheduledEventRuntimeHandler({
  environment: process.env,
  fetch: globalThis.fetch,
});
