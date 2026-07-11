import { NextRequest } from 'next/server';
import { handleQuestionnairePost } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleQuestionnairePost(request);
}
