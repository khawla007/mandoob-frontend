import 'server-only';

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import { ApiError } from '@/lib/errors';

export type ActionRequestMetadata = {
  ip: string;
  userAgent: string | null;
};

export function normalizeActionRequestMetadata(requestHeaders: Headers): ActionRequestMetadata {
  const forwardedIp = requestHeaders.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  const userAgent = requestHeaders.get('user-agent');

  return {
    ip: forwardedIp && isIP(forwardedIp) !== 0 ? forwardedIp : 'unknown',
    userAgent: userAgent === null ? null : userAgent.slice(0, 512),
  };
}

export function logSafeActionError(operation: string, error: unknown): void {
  const apiError = error instanceof ApiError;
  console.error({
    operation,
    code: apiError ? error.code : 'UNEXPECTED',
    errorClass: apiError ? 'ApiError' : 'UnknownError',
    correlationId: randomUUID(),
  });
}
