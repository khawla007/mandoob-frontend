import { handleDeleteAttachment, handleUploadAttachmentPost } from './handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleUploadAttachmentPost(request, id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleDeleteAttachment(request, id);
}
