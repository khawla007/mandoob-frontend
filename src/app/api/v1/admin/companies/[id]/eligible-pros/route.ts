import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SessionProfile } from '@/lib/auth/require-user';
import { errorResponse, jsonOk } from '@/lib/errors';
import type { EligiblePro } from '@/lib/data/pro-eligibility';
import {
  limitResponse,
  notFoundResponse,
  requireAal2Response,
  type LimitDecision,
} from '@/app/api/v1/_shared/pro-lifecycle-routes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = z.string().uuid();
const querySchema = z.string().trim().min(2).max(160);
type Context = { params: Promise<{ id: string }> };
type Deps = {
  requireOperator(): Promise<SessionProfile>;
  resolveCompany(id: string): Promise<{ id: string } | null>;
  limit(actorId: string, companyId: string): Promise<LimitDecision>;
  list(companyId: string, query: string, limit: number, actorId: string): Promise<EligiblePro[]>;
};

const defaults: Deps = {
  requireOperator: async () => (await import('@/lib/auth/require-role')).requirePlatformOperator(),
  resolveCompany: async (id) => (await import('@/lib/data/pro-firms')).getCompanyById(id),
  limit: async (actorId, companyId) => {
    const { consumeSensitiveRateLimit, SENSITIVE_RATE_LIMITS } = await import('@/lib/rate-limit');
    return consumeSensitiveRateLimit({
      key: `company-pro-lookup:${actorId}:${companyId}`,
      routeLabel: 'company-pro-lookup',
      correlationId: randomUUID(),
      ...SENSITIVE_RATE_LIMITS.credentialReview,
    });
  },
  list: async (...args) =>
    (await import('@/lib/data/pro-eligibility')).listEligibleProsForCompany(...args),
};

export function createEligibleProsGetHandler(overrides: Partial<Deps> = {}) {
  const deps = { ...defaults, ...overrides };
  return async (request: Request, context: Context): Promise<Response> => {
    let session: SessionProfile;
    try {
      session = await deps.requireOperator();
    } catch {
      return notFoundResponse();
    }
    const aal = requireAal2Response(session);
    if (aal) return aal;
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) return notFoundResponse();
    const company = await deps.resolveCompany(id);
    if (!company || company.id !== id) return notFoundResponse();
    let decision: LimitDecision;
    try {
      decision = await deps.limit(session.id, id);
    } catch {
      decision = 'unavailable';
    }
    const limited = limitResponse(decision);
    if (limited) return limited;
    const query = querySchema.safeParse(new URL(request.url).searchParams.get('q') ?? '');
    if (!query.success) return errorResponse('VALIDATION_FAILED', 'Invalid search query', 400);
    try {
      const rows = await deps.list(id, query.data, 20, session.id);
      return jsonOk({
        rows: rows.map((row) => ({
          proProfileId: row.proProfileId,
          fullName: row.fullName,
          designation: row.designation,
          department: row.department,
          eligibility: { eligible: row.eligibility.eligible, codes: row.eligibility.codes },
        })),
      });
    } catch {
      return errorResponse('INTERNAL', 'Unable to search PRO users', 500);
    }
  };
}

export const GET = createEligibleProsGetHandler();
