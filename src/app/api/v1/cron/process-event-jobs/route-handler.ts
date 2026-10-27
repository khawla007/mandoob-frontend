import { createHash, timingSafeEqual } from 'node:crypto';

type WorkerSummary = { claimed: number; succeeded: number; failed: number; leaseLost: number };

export const EVENT_RUNTIME_CADENCE_DISPOSITION = {
  configured: false,
  status: 'launch-blocking',
  reason: 'DEPLOY_SCHEDULE_NOT_APPROVED',
} as const;

function secretMatches(configured: string | undefined, supplied: string | null): boolean {
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = createHash('sha256').update(configured).digest();
  const actual = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expected, actual);
}

export function createProcessEventJobsHandler(input: {
  configuredSecret: string | undefined;
  consumers: readonly string[];
  deadlineMs?: number;
  runConsumer(
    consumer: string,
    options: { owner: string; batchSize: number; signal: AbortSignal; deadlineAt: number },
  ): Promise<WorkerSummary>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!secretMatches(input.configuredSecret, request.headers.get('x-cron-secret'))) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const deadlineController = new AbortController();
    const relayRequestAbort = () => deadlineController.abort();
    if (request.signal.aborted) relayRequestAbort();
    else request.signal.addEventListener('abort', relayRequestAbort, { once: true });
    const deadlineMs = Math.min(Math.max(input.deadlineMs ?? 20_000, 1), 20_000);
    const deadlineAt = Date.now() + deadlineMs;
    const deadlineTimer = setTimeout(() => deadlineController.abort(), deadlineMs);
    let completed = 0;
    let unavailable = 0;
    try {
      for (const [index, consumer] of input.consumers.entries()) {
        if (deadlineController.signal.aborted) {
          unavailable += input.consumers.length - index;
          break;
        }
        try {
          await input.runConsumer(consumer, {
            owner: 'netlify.event-runtime',
            batchSize: 1,
            signal: deadlineController.signal,
            deadlineAt,
          });
          if (deadlineController.signal.aborted) {
            unavailable += input.consumers.length - index;
            break;
          }
          completed += 1;
        } catch {
          unavailable += 1;
          if (deadlineController.signal.aborted) {
            unavailable += input.consumers.length - index - 1;
            break;
          }
        }
      }
    } finally {
      clearTimeout(deadlineTimer);
      request.signal.removeEventListener('abort', relayRequestAbort);
    }
    return Response.json(
      { ok: unavailable === 0, consumers: input.consumers.length, completed, unavailable },
      { status: unavailable === 0 ? 200 : 503 },
    );
  };
}
