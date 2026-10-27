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
  runConsumer(
    consumer: string,
    options: { owner: string; batchSize: number; signal: AbortSignal; deadlineAt: number },
  ): Promise<WorkerSummary>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!secretMatches(input.configuredSecret, request.headers.get('x-cron-secret'))) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    let completed = 0;
    let unavailable = 0;
    const deadlineAt = Date.now() + 20_000;
    for (const consumer of input.consumers) {
      try {
        await input.runConsumer(consumer, {
          owner: 'netlify.event-runtime',
          batchSize: 1,
          signal: request.signal,
          deadlineAt,
        });
        completed += 1;
      } catch {
        unavailable += 1;
      }
    }
    return Response.json(
      { ok: unavailable === 0, consumers: input.consumers.length, completed, unavailable },
      { status: unavailable === 0 ? 200 : 503 },
    );
  };
}
