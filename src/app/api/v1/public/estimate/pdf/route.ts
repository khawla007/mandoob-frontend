import { NextRequest } from 'next/server';
import { getClientIp, parseJson } from '@/lib/auth/request';
import { calculateEstimate, EstimateError, estimateInputSchema } from '@/lib/estimator';
import { listActiveEstimatorCostRows } from '@/lib/estimator/data';
import { errorResponse } from '@/lib/errors';
import { formatMoney } from '@/lib/format/money';
import { generateEstimatePdf } from '@/lib/pdf/estimate';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DOCUMENT_LABELS: Record<string, string> = {
  attested_documents: 'Attested corporate documents',
  business_plan: 'Business plan or activity summary',
  lease_agreement: 'Lease agreement or flexi desk confirmation',
  medical_fitness: 'Medical fitness and Emirates ID documents',
  passport: 'Passport copy',
  photo: 'Passport photo',
  shareholder_resolution: 'Shareholder resolution',
  trade_license: 'Trade license copy',
};

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!(await consumeRateLimit({ key: `estimate-pdf:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many PDF requests. Try again later.', 429);
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
    const rows = await listActiveEstimatorCostRows();
    const estimate = calculateEstimate(input, rows);
    const bytes = await generateEstimatePdf({
      reference: estimate.reference,
      jurisdictionLabel: `${estimate.input.authority} ${estimate.input.jurisdiction.replace('_', ' ')}`,
      activityLabel: estimate.input.activityKey,
      generatedAt: estimate.generatedAt,
      oneTimeTotal: estimate.oneTimeTotal,
      annualTotal: estimate.annualTotal,
      timeline: `${estimate.timelineDays.min}-${estimate.timelineDays.max} business days`,
      lineItems: estimate.lineItems.map((item) => ({
        label: item.label,
        quantity: item.quantity,
        recurrence: item.recurrence,
        total: formatMoney(item.totalMinor, 'AED'),
      })),
      requiredDocuments: estimate.requiredDocumentKeys.map((key) => DOCUMENT_LABELS[key] ?? key),
      assumptions: estimate.assumptions,
    });

    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="mandoob-estimate-${estimate.reference}.pdf"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof EstimateError) {
      return errorResponse(error.code, error.message, error.code === 'INVALID_INPUT' ? 400 : 422);
    }
    console.error('public estimate pdf failed', error);
    return errorResponse('INTERNAL', 'Could not generate estimate PDF', 500);
  }
}
