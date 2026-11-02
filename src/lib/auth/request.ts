import 'server-only';
import type { NextRequest } from 'next/server';
import { BODY_LIMITS, readBoundedJson } from '@/lib/http/bounded-body';

export function getClientIp(request: Request | NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '0.0.0.0';
}

export function getUserAgent(request: Request | NextRequest): string | null {
  return request.headers.get('user-agent');
}

export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await readBoundedJson(request, BODY_LIMITS.publicJson)) as T;
  } catch {
    return null;
  }
}
