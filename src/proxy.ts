import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import createIntlMiddleware from 'next-intl/middleware';
import { resolveHost, isPassthroughPath } from '@/lib/tenant/resolve-host';
import { updateSession } from '@/lib/supabase/update-session';
import { routing } from '@/i18n/routing';

const CSRF_COOKIE = 'mandoob-csrf';
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

const intlMiddleware = createIntlMiddleware(routing);

const PUBLIC_LOCALE_BASES = [
  'pricing',
  'estimate',
  'knowledge-base',
  'legal',
  'company-setup',
  'apply',
] as const;

function isPublicLocalePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/ar') return true;
  if (pathname.startsWith('/ar/')) return true;
  return PUBLIC_LOCALE_BASES.some((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`));
}

function applyHostHeaders(response: NextResponse, ctx: ReturnType<typeof resolveHost>) {
  response.headers.set('x-host-context', ctx.kind);
  if (ctx.kind === 'tenant') response.headers.set('x-tenant-slug', ctx.slug);
}

function applyCsrfCookie(request: NextRequest, response: NextResponse) {
  if (!request.cookies.get(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ROOT_DOMAIN;
  const ctx = resolveHost({ host, rootDomain: ROOT_DOMAIN });
  const pathname = request.nextUrl.pathname;

  // Marketing host + public locale path → run next-intl first (locale detect, prefix rewrite, redirects).
  if (ctx.kind === 'marketing' && isPublicLocalePath(pathname)) {
    const intlResponse = intlMiddleware(request);

    // Honor explicit redirects from next-intl (e.g., Accept-Language → /ar).
    if (intlResponse.status >= 300 && intlResponse.status < 400) {
      applyHostHeaders(intlResponse, ctx);
      applyCsrfCookie(request, intlResponse);
      return intlResponse;
    }

    // Otherwise next-intl produced a NextResponse.next() or rewrite — layer session + CSRF on top.
    const { response } = await updateSession(request, intlResponse);
    applyHostHeaders(response, ctx);
    applyCsrfCookie(request, response);
    return response;
  }

  // Non-marketing host OR non-public path → original host-based logic.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-host-context', ctx.kind);
  if (ctx.kind === 'tenant') requestHeaders.set('x-tenant-slug', ctx.slug);
  if (!request.headers.get('x-mandoob-internal')) {
    requestHeaders.delete('x-mandoob-internal');
  }

  const url = request.nextUrl.clone();
  if (!isPassthroughPath(pathname)) {
    if (ctx.kind === 'tenant' && !pathname.startsWith(`/t/${ctx.slug}`)) {
      url.pathname = `/t/${ctx.slug}${pathname === '/' ? '' : pathname}`;
    } else if (ctx.kind === 'admin' && !pathname.startsWith('/admin')) {
      url.pathname = `/admin${pathname === '/' ? '' : pathname}`;
    }
  }

  const initialResponse =
    url.pathname !== pathname
      ? NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  const { response } = await updateSession(request, initialResponse);
  applyHostHeaders(response, ctx);
  applyCsrfCookie(request, response);

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and _next internals.
    '/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)',
  ],
};
