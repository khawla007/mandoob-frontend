import { handleCreateDraftPost } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  return handleCreateDraftPost(request);
}
