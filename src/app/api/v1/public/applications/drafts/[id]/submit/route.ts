import { handleSubmitApplicationPost } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleSubmitApplicationPost(request, id);
}
