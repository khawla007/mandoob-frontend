import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { processPendingMeetingAiSummaries } from '@/lib/meetings/ai-summary';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || !auth || auth !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const result = await processPendingMeetingAiSummaries({ batchSize: 5 });
  return NextResponse.json(result);
}
