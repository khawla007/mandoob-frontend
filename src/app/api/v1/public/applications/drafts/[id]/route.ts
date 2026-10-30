import { handleResumeDraftGet, handleSaveDraftPatch } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleResumeDraftGet(request, id);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleSaveDraftPatch(request, id);
}
