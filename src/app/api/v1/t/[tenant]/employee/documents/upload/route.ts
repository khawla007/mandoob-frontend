import { createEmployeeDocumentUploadPostHandler } from './route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = createEmployeeDocumentUploadPostHandler();
