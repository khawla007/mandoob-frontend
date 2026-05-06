import { NextResponse } from 'next/server';
import { processWhatsAppQueue } from '@/lib/whatsapp/send';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('x-cron-secret');
  if (!env.CRON_SECRET || !auth || auth !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const result = await processWhatsAppQueue({ batchSize: 25 });
  return NextResponse.json(result);
}
