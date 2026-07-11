import { NextRequest } from 'next/server';
import { handleEstimatePost } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleEstimatePost(request);
}
