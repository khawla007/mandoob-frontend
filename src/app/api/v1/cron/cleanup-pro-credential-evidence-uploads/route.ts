import { NextResponse } from 'next/server';

import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Counts = { claimed: number; cleaned: number; referenced: number; retryable: number };
type Deps = {
  secret(): string | undefined;
  run(): Promise<Counts>;
};

const defaults: Deps = {
  secret: () => env.CRON_SECRET,
  run: async () =>
    (
      await import('@/lib/data/pro-evidence-upload-cleanup')
    ).cleanupAbandonedProCredentialEvidenceUploads(),
};

export function createCleanupRouteHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request): Promise<Response> => {
    const configured = deps.secret();
    const provided = request.headers.get('x-cron-secret');
    if (!configured || !provided || provided !== configured) {
      return NextResponse.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    try {
      return NextResponse.json({ ok: true, ...(await deps.run()) });
    } catch {
      return NextResponse.json(
        { error: 'Cleanup temporarily unavailable', code: 'INTERNAL' },
        { status: 500 },
      );
    }
  };
}

export const POST = createCleanupRouteHandler();
