import { NextRequest } from 'next/server';
import { getClientIp, parseJson } from '@/lib/auth/request';
import {
  buildApplyNowUrl,
  calculateAuthoritativeEstimate,
  createEstimateResultToken,
  EstimateError,
  estimateInputSchema,
  type VersionedCostDataRow,
} from '@/lib/estimator';
import { listActiveEstimatorCostRows } from '@/lib/estimator/data';
import { errorResponse, jsonOk } from '@/lib/errors';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { env } from '@/lib/env';

export async function handleEstimatePost(
  request: NextRequest,
  deps: {
    consume?: typeof consumeRateLimit;
    listRows?: () => Promise<VersionedCostDataRow[]>;
    signingSecret?: string;
  } = {},
) {
  const consume = deps.consume ?? consumeRateLimit;
  const listRows = deps.listRows ?? listActiveEstimatorCostRows;
  const ip = getClientIp(request);
  if (!(await consume({ key: `estimate:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many estimates. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = estimateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }
  const input = parsed.data;

  try {
    const rows = await listRows();
    const estimate = calculateAuthoritativeEstimate(input, rows);
    const signingSecret = deps.signingSecret ?? env.ENCRYPTION_KEY;
    if (!signingSecret) throw new Error('estimate signing secret unavailable');
    const resultToken = createEstimateResultToken(estimate, signingSecret);
    const handoff = buildApplyNowUrl(input, estimate);
    return jsonOk({
      estimate,
      resultToken,
      handoffUrl: `${handoff.pathname}${handoff.search}`,
    });
  } catch (error) {
    if (error instanceof EstimateError) {
      return errorResponse(error.code, error.message, error.code === 'INVALID_INPUT' ? 400 : 422);
    }
    console.error('public estimate failed', error);
    return errorResponse('INTERNAL', 'Could not calculate estimate', 500);
  }
}
