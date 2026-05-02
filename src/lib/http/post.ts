'use client';

function getCsrfFromCookie(): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith('mandoob-csrf='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

/**
 * POST JSON with the CSRF double-submit header attached. Use from client components
 * instead of raw fetch() for state-changing auth endpoints.
 */
export async function postJson(path: string, body: unknown, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  const csrf = getCsrfFromCookie();
  if (csrf) headers.set('x-mandoob-csrf', csrf);
  return fetch(path, {
    ...init,
    method: init?.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
