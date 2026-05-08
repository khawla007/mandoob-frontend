import { NextRequest } from 'next/server';
import { getClientIp, parseJson } from '@/lib/auth/request';
import { createLeadFromQuestionnaire } from '@/lib/data/leads';
import { errorResponse, jsonOk } from '@/lib/errors';
import { questionnaireSubmissionSchema } from '@/lib/questionnaire';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleQuestionnairePost(request);
}

export async function handleQuestionnairePost(
  request: NextRequest,
  deps: {
    consume?: typeof consumeRateLimit;
    createLead?: typeof createLeadFromQuestionnaire;
  } = {},
) {
  const consume = deps.consume ?? consumeRateLimit;
  const createLead = deps.createLead ?? createLeadFromQuestionnaire;
  const ip = getClientIp(request);

  if (!(await consume({ key: `questionnaire:${ip}`, ...RATE_LIMITS.authPublicIp }))) {
    return errorResponse('RATE_LIMITED', 'Too many submissions. Try again later.', 429);
  }

  const raw = await parseJson<unknown>(request);
  const parsed = questionnaireSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse('INVALID_INPUT', 'Invalid request', 400, {
      issues: parsed.error.issues,
    });
  }

  try {
    return jsonOk(await createLead(parsed.data));
  } catch (error) {
    console.error('public questionnaire failed', error);
    return errorResponse('INTERNAL', 'Could not create lead', 500);
  }
}
