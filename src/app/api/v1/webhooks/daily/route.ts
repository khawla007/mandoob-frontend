import { handleDailyWebhook } from './route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handleDailyWebhook(request);
}
