import { processQueue } from '@/lib/mail/send';
import { env } from '@/lib/env';
import { createLegacyEventWorkerHandler } from '../legacy-event-worker-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = createLegacyEventWorkerHandler({
  cutoverValue: env.EVENT_RUNTIME_SCHEDULER_CUTOVER,
  configuredSecret: env.CRON_SECRET,
  run: () => processQueue({ batchSize: 50 }),
});
