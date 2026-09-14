import { createEvidenceDeleteHandler, createEvidenceGetHandler } from './route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createEvidenceGetHandler();
export const DELETE = createEvidenceDeleteHandler();
