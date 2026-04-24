import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { resolveHost, isPassthroughPath } from '@/lib/tenant/resolve-host';
import { updateSession } from '@/lib/supabase/update-session';

const CSRF_COOKIE = 'mandoob-csrf';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? ROOT_DOMAIN;
  const ctx = resolveHost({ host, rootDomain: ROOT_DOMAIN });
  const pathname = request.nextUrl.pathname;

  // Build request headers with tenant context for downstream consumers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-host-context', ctx.kind);
  if (ctx.kind === 'tenant') requestHeaders.set('x-tenant-slug', ctx.slug);
  // Strip anything client-injected.
  if (!request.headers.get('x-mandoob-internal')) {
    requestHeaders.delete('x-mandoob-internal');
  }

  // Compute rewrite URL based on host context. Auth paths stay put on every host.
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
  response.headers.set('x-host-context', ctx.kind);
  if (ctx.kind === 'tenant') response.headers.set('x-tenant-slug', ctx.slug);

  // Issue CSRF token on first visit. SameSite=Lax, readable by JS (non-HttpOnly)
  // per double-submit pattern. The server checks cookie === x-mandoob-csrf header.
  if (!request.cookies.get(CSRF_COOKIE)) {
    response.cookies.set(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets and _next internals.
    '/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)',
  ],
};
