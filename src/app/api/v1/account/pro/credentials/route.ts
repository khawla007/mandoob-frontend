import { createCredentialPostHandler } from './route-handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = createCredentialPostHandler();
