import { legacyEventWorkersAllowed } from '@/lib/events/runtime-cutover';

export function createLegacyEventWorkerHandler<TResult>(input: {
  cutoverValue: string | undefined;
  configuredSecret: string | undefined;
  run(): Promise<TResult>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const suppliedSecret = request.headers.get('x-cron-secret');
    if (!input.configuredSecret || !suppliedSecret || suppliedSecret !== input.configuredSecret) {
      return Response.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (!legacyEventWorkersAllowed(input.cutoverValue)) {
      return Response.json(
        { error: 'unavailable', code: 'EVENT_RUNTIME_CUTOVER_ACTIVE' },
        { status: 503 },
      );
    }

    return Response.json(await input.run());
  };
}
