import { P112_TARGET } from './contract';
import { realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export type P112RequestInput = {
  method: string;
  url: string;
  stateId: string;
  evidenceProfile?: string;
  fixtureFactorId?: string;
  fixtureFailureTag?: string;
  allowedPagePathsByState?: ReadonlyMap<string, ReadonlySet<string>>;
  allowedPageQueriesByState?: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;
  reviewedStaticPaths?: ReadonlySet<string>;
  reviewedNextStaticRoot?: string;
};
export type P112NormalizedRequest = {
  method: string;
  origin: string;
  path: string;
  stateId: string;
  queryShape:
    | 'none'
    | 'state-contract'
    | 'next-rsc'
    | 'next-image'
    | 'next-metadata-hash'
    | 'next-dev-static'
    | 'auth-refresh-token'
    | 'unreviewed';
};

const NEXT_DEVELOPMENT_STATIC_PATH =
  /^\/_next\/static\/(?:css\/app\/(?:[A-Za-z0-9_@()[\].=-]+\/)*[A-Za-z0-9_@()[\].=-]+\.css|chunks\/(?:[A-Za-z0-9_@()[\].=-]+\/)*[A-Za-z0-9_@()[\].=-]+\.js|media\/[a-f0-9]{16,64}-s\.p\.(?:ttf|woff2)|webpack\/(?:[a-f0-9]{16}\.webpack\.hot-update\.json|webpack\.[a-f0-9]{16}\.hot-update\.js))$/u;

function isP112DevelopmentStaticPath(pathname: string): boolean {
  if (/%(?:2f|5c)/iu.test(pathname)) return false;
  try {
    return NEXT_DEVELOPMENT_STATIC_PATH.test(decodeURIComponent(pathname));
  } catch {
    return false;
  }
}

const APP_API_STATES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  '/api/v1/auth/csrf': { GET: ['S078', 'S085', 'S096', 'S101', 'S108', 'S114', 'S120', 'S126'] },
  '/api/v1/auth/login': {
    POST: ['S078', 'S079', 'S080', 'S081', 'S082', 'S128', 'S138', 'S142'],
  },
  '/api/v1/auth/register': { POST: ['S085', 'S086', 'S087', 'S088', 'S089', 'S090'] },
  '/api/v1/auth/invite/accept': { POST: ['S097', 'S098', 'S099', 'S100'] },
  '/api/v1/auth/verify-otp': { POST: ['S102', 'S103', 'S104', 'S105', 'S107'] },
  '/api/v1/auth/resend-otp': { POST: ['S106'] },
  '/api/v1/auth/forgot-password': { POST: ['S109', 'S110', 'S111', 'S112', 'S113'] },
  '/api/v1/auth/reset-password': { POST: ['S115', 'S116', 'S117', 'S118', 'S119'] },
  '/api/v1/auth/mfa/enroll': {
    POST: ['S121', 'S128', 'S138', 'S139', 'S140', 'S142', 'S144'],
  },
  '/api/v1/auth/mfa/verify': {
    POST: ['S122', 'S123', 'S124', 'S125', 'S128', 'S129', 'S130', 'S131', 'S132', 'S142'],
  },
  '/api/v1/auth/mfa/recovery': { POST: ['S141', 'S142', 'S146'] },
  '/api/v1/auth/logout': { POST: ['S142', 'S143'] },
};

const FROZEN_STATE = /^S(?:0(?:0[1-9]|[1-9][0-9])|1(?:[0-3][0-9]|4[0-6]))$/u;
const GENERATED_OR_IMAGE_PATH = new Set([
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/_next/image',
]);
const PRIVACY_QUERY_KEY =
  /^(?:token|code|email|password|otp|totp|pkce|secret|key|authorization|cookie)$/iu;

function classifyPageQuery(
  url: URL,
  stateId: string,
  contracts?: P112RequestInput['allowedPageQueriesByState'],
): { allowed: boolean; shape: P112NormalizedRequest['queryShape'] } {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => PRIVACY_QUERY_KEY.test(key)))
    return { allowed: false, shape: 'unreviewed' };
  const stateContract = contracts?.get(stateId)?.get(url.pathname);
  if (stateContract?.has(url.search))
    return { allowed: true, shape: url.search === '' ? 'none' : 'state-contract' };
  const rscValues = url.searchParams.getAll('_rsc');
  if (rscValues.length === 1 && /^[a-z0-9_-]{1,32}$/iu.test(rscValues[0]!)) {
    const withoutRsc = new URL(url);
    withoutRsc.searchParams.delete('_rsc');
    if (stateContract?.has(withoutRsc.search)) return { allowed: true, shape: 'next-rsc' };
  }
  if (url.search === '' && contracts === undefined) return { allowed: true, shape: 'none' };
  return { allowed: false, shape: 'unreviewed' };
}

export function isP112LocalNextStaticPath(pathname: string, root: string): boolean {
  if (!pathname.startsWith('/_next/static/')) return false;
  const relativePath = pathname.slice('/_next/static/'.length);
  try {
    const rootPath = realpathSync(resolve(root));
    const candidate = realpathSync(resolve(rootPath, decodeURIComponent(relativePath)));
    const bounded = relative(rootPath, candidate);
    return (
      bounded !== '' &&
      !bounded.startsWith(`..${sep}`) &&
      bounded !== '..' &&
      statSync(candidate).isFile()
    );
  } catch {
    return false;
  }
}

const BACKEND_PROBE_STATES: Readonly<Record<string, readonly string[]>> = {
  '/blog': ['S024', 'S025', 'S026', 'S027', 'S136'],
  '/blog/p1-12-public-fixture': ['S028', 'S029'],
  '/blog/p1-12-missing': ['S030'],
  '/legal/privacy': ['S003', 'S038', 'S039'],
  '/legal/terms': ['S038'],
  '/legal/pdpl': ['S038'],
  '/legal/trust': ['S038'],
  '/p1-12-missing': ['S040'],
  '/evidence-editorial-page': ['S134', 'S135'],
};

export function p112DestinationProbeStrategy(
  stateId: string,
  pathname: string,
): 'http' | 'declaration' {
  const owners = BACKEND_PROBE_STATES[pathname];
  return !owners || owners.includes(stateId) ? 'http' : 'declaration';
}

export function classifyP112BrowserRequest(input: P112RequestInput): {
  allowed: boolean;
  category: string;
  queryShape: P112NormalizedRequest['queryShape'];
} {
  const method = input.method.toUpperCase();
  const url = new URL(input.url);
  if (url.protocol === 'data:' || url.protocol === 'blob:')
    return { allowed: method === 'GET', category: 'embedded-asset', queryShape: 'none' };
  if (url.origin === P112_TARGET.appOrigin) {
    const isRouteErrorDevelopmentSupport =
      input.stateId === 'S134' &&
      input.evidenceProfile === 'route-error' &&
      url.search === '' &&
      ((method === 'GET' && url.pathname === '/__nextjs_font/geist-latin.woff2') ||
        (method === 'POST' && url.pathname === '/__nextjs_original-stack-frames'));
    if (isRouteErrorDevelopmentSupport) {
      return { allowed: true, category: 'next-development-error-support', queryShape: 'none' };
    }
    if (url.pathname.startsWith('/api/')) {
      const allowed =
        url.search === '' &&
        (APP_API_STATES[url.pathname]?.[method]?.includes(input.stateId) ?? false);
      return {
        allowed,
        category: allowed ? 'app-auth-api' : 'denied',
        queryShape: url.search === '' ? 'none' : 'unreviewed',
      };
    }
    const isReviewedImageRequest =
      url.pathname === '/_next/image' &&
      [...url.searchParams.keys()].sort().join(',') === 'q,url,w' &&
      /^\/[^?#]+$/u.test(url.searchParams.get('url') ?? '') &&
      /^\d+$/u.test(url.searchParams.get('w') ?? '') &&
      /^\d+$/u.test(url.searchParams.get('q') ?? '');
    const isStatePage =
      input.allowedPagePathsByState?.get(input.stateId)?.has(url.pathname) === true;
    const isStatic =
      input.reviewedStaticPaths?.has(url.pathname) === true ||
      (input.reviewedNextStaticRoot !== undefined &&
        isP112LocalNextStaticPath(url.pathname, input.reviewedNextStaticRoot)) ||
      (GENERATED_OR_IMAGE_PATH.has(url.pathname) && url.pathname !== '/_next/image');
    const isDevelopmentStatic =
      input.evidenceProfile !== undefined &&
      input.evidenceProfile !== 'production' &&
      isP112DevelopmentStaticPath(url.pathname) &&
      (url.search === '' || /^\?v=\d{13}$/u.test(url.search));
    const isReviewedMetadataHash =
      url.pathname === '/favicon.ico' && /^\?[a-f0-9]{16}$/u.test(url.search);
    const pageQuery = classifyPageQuery(url, input.stateId, input.allowedPageQueriesByState);
    const queryShape = isReviewedImageRequest
      ? 'next-image'
      : isDevelopmentStatic
        ? 'next-dev-static'
        : isReviewedMetadataHash
          ? 'next-metadata-hash'
          : isStatePage
            ? pageQuery.shape
            : url.search === ''
              ? 'none'
              : 'unreviewed';
    const allowedPath =
      (isStatePage && pageQuery.allowed) ||
      isDevelopmentStatic ||
      (isStatic && url.search === '') ||
      (isStatic && isReviewedMetadataHash) ||
      (url.pathname === '/_next/image' && isReviewedImageRequest);
    const allowed =
      FROZEN_STATE.test(input.stateId) && (method === 'GET' || method === 'HEAD') && allowedPath;
    return { allowed, category: allowed ? 'app-page-static-rsc' : 'denied', queryShape };
  }
  if (url.origin !== P112_TARGET.apiOrigin)
    return {
      allowed: false,
      category: 'denied',
      queryShape: url.search === '' ? 'none' : 'unreviewed',
    };
  if (
    method === 'GET' &&
    url.pathname === '/auth/v1/user' &&
    ['S128', 'S138', 'S142', 'S143', 'S145'].includes(input.stateId)
  )
    return {
      allowed: url.search === '',
      category: 'auth-factor-discovery',
      queryShape: url.search === '' ? 'none' : 'unreviewed',
    };
  if (
    method === 'DELETE' &&
    input.fixtureFactorId &&
    url.pathname === `/auth/v1/factors/${encodeURIComponent(input.fixtureFactorId)}` &&
    ['S139', 'S142', 'S143'].includes(input.stateId)
  )
    return {
      allowed: url.search === '',
      category: 'auth-fixture-factor-delete',
      queryShape: url.search === '' ? 'none' : 'unreviewed',
    };
  if (
    method === 'POST' &&
    url.pathname === '/auth/v1/token' &&
    url.search === '?grant_type=refresh_token' &&
    ['S131', 'S142'].includes(input.stateId)
  )
    return { allowed: true, category: 'auth-session-refresh', queryShape: 'auth-refresh-token' };
  return {
    allowed: false,
    category: 'denied',
    queryShape: url.search === '' ? 'none' : 'unreviewed',
  };
}

export function normalizeP112Request(
  method: string,
  value: string,
  stateId: string,
  queryShape?: P112NormalizedRequest['queryShape'],
): P112NormalizedRequest {
  const url = new URL(value);
  const path = (url.protocol === 'data:' || url.protocol === 'blob:' ? '/:embedded' : url.pathname)
    .replace(/^\/invite\/[^/]+$/u, '/invite/:runtime-token')
    .replace(/^\/auth\/v1\/factors\/[^/]+$/u, '/auth/v1/factors/:runtime-factor-id');
  const safeShape = queryShape ?? (url.search === '' ? 'none' : 'unreviewed');
  return { method: method.toUpperCase(), origin: url.origin, path, stateId, queryShape: safeShape };
}

export function isExpectedP112RequestFailure(input: P112RequestInput): boolean {
  const url = new URL(input.url);
  return (
    input.stateId === 'S100' &&
    input.method.toUpperCase() === 'POST' &&
    url.origin === P112_TARGET.appOrigin &&
    url.pathname === '/api/v1/auth/invite/accept' &&
    input.fixtureFailureTag === 'expected_fixture_failure:S100:invite-source-unavailable'
  );
}

export function isExpectedP112RouteErrorConsole(input: {
  stateId: string;
  evidenceProfile?: string;
  text: string;
  url: string;
}): boolean {
  return (
    input.stateId === 'S134' &&
    input.evidenceProfile === 'route-error' &&
    input.text.startsWith('%o\n\n%s Error: isolated development route error evidence\n') &&
    input.url.endsWith('/next/dist/client/react-client-callbacks/error-boundary-callbacks.js')
  );
}

export function isP112ExpectedClientNavigationAbort(
  input: P112RequestInput & {
    resourceType: string;
    allowed: boolean;
    failure: string;
    targetPath: string;
  },
): boolean {
  const url = new URL(input.url);
  const target = new URL(input.targetPath, P112_TARGET.appOrigin);
  const rsc = url.searchParams.getAll('_rsc');
  const withoutRsc = new URL(url);
  withoutRsc.searchParams.delete('_rsc');
  return (
    input.allowed &&
    input.method.toUpperCase() === 'GET' &&
    input.resourceType === 'fetch' &&
    input.failure === 'net::ERR_ABORTED' &&
    url.origin === P112_TARGET.appOrigin &&
    target.origin === P112_TARGET.appOrigin &&
    withoutRsc.pathname === target.pathname &&
    withoutRsc.search === target.search &&
    rsc.length === 1 &&
    /^[a-z0-9_-]{1,32}$/iu.test(rsc[0]!)
  );
}

const PUBLISHED_CORPORATE_PHONE = /\+971(?: 4 555 0123|45550123)(?![\s()-]*\d)/gu;

const PRIVACY_PATTERNS: readonly [RegExp, string][] = [
  [/(?:otpauth:\/\/|\bmanual secret\b|\brecovery codes?\s*[=:])/iu, 'MFA secret material'],
  [/[?&](?:token|code|email|password|otp|pkce|secret)=[^&#\s]+/iu, 'secret URL parameter'],
  [
    /(?:access_token|refresh_token|service_role|password|recovery_code|otp|pkce|cookie|authorization)\s*[=:]/iu,
    'credential parameter',
  ],
  [/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}/u, 'JWT-shaped value'],
  [/[\w.+-]+@(?!mandoob\.ae\b)[\w.-]+\.[A-Za-z]{2,}/u, 'email address'],
  [/(?:\+971|00971)[\s()-]*\d(?:[\s()-]*\d){7,9}\b/u, 'phone number'],
  [
    /\b(?:passport|emirates[-_ ]?id|visa|bank[-_ ]?statement)[\w ._-]*\.(?:pdf|png|jpe?g)\b/iu,
    'private document name',
  ],
  [/(?:\/home\/|\/Users\/|[A-Z]:\\Users\\|\.env(?:\.|\b))/u, 'private filesystem path'],
  [
    /\b(?:postgres(?:ql)?|postgrest|supabase|service role|database constraint|SQLSTATE)\b/iu,
    'internal provider detail',
  ],
  [
    /\b(?:guaranteed|guarantee)(?:\s+\w+){0,3}\s+(?:approval|licen[cs]e|outcome|success)\b/iu,
    'unsupported guarantee',
  ],
  [/\b(?:only|exactly|fixed)\s+AED\s*[\d,]+(?:\.\d+)?\b/iu, 'unsupported price claim'],
  [
    /\b(?:approved?|licen[cs]ed?|completed?)\s+(?:within|in)\s+\d+\s+(?:hours?|days?|weeks?)\b/iu,
    'unsupported timeline claim',
  ],
  [/\b(?:rated|reviewed)\s+(?:five|5)\s*stars?\s+by\s+\d+/iu, 'unsupported testimonial claim'],
  [
    /\b(?:official|exclusive|certified)\s+(?:UAE\s+)?government\s+partner\b/iu,
    'unsupported partnership claim',
  ],
  [/\b(?:ISO\s*27001|SOC\s*2)\s+certified\b/iu, 'unsupported certification claim'],
  [
    /\b\d{1,5}\s+[A-Za-z][A-Za-z .'-]+\s+(?:Road|Street|Avenue|Boulevard)\b/iu,
    'unsupported street address',
  ],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
    'internal identifier',
  ],
];

/** Returns only a safe category; the matched value is deliberately never retained. */
export function findPrivacyLeak(value: string): string | null {
  const valueWithoutPublishedPhone = value.replace(PUBLISHED_CORPORATE_PHONE, '');
  return (
    PRIVACY_PATTERNS.find(([pattern]) => pattern.test(valueWithoutPublishedPhone))?.[1] ?? null
  );
}

export function parseP112RobotsDirective(value: string): { index: boolean; follow: boolean } {
  const tokens = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.some((token) => !['index', 'noindex', 'follow', 'nofollow'].includes(token))) {
    throw new Error('P1.12 robots directive contains unsupported token');
  }
  const indexTokens = tokens.filter((token) => token === 'index' || token === 'noindex');
  const followTokens = tokens.filter((token) => token === 'follow' || token === 'nofollow');
  if (indexTokens.length !== 1 || followTokens.length !== 1) {
    throw new Error('P1.12 robots directive requires exact pair');
  }
  if ((indexTokens[0] === 'index') !== (followTokens[0] === 'follow')) {
    throw new Error('P1.12 robots directive contradictory');
  }
  return { index: indexTokens[0] === 'index', follow: followTokens[0] === 'follow' };
}

export function parseP112RobotsMetadata(
  values: readonly string[],
  allowFrameworkNotFound: boolean,
): { index: boolean; follow: boolean } {
  if (values.length === 0) return { index: true, follow: true };
  if (values.length === 1) return parseP112RobotsDirective(values[0]!);
  if (!allowFrameworkNotFound || values.length !== 2) {
    throw new Error('P1.12 robots metadata count invalid');
  }

  const normalized = values.map((value) => value.trim().toLowerCase());
  const frameworkNoindex = normalized.filter((value) => value === 'noindex');
  const declaredPair = normalized.filter((value) => value !== 'noindex');
  if (frameworkNoindex.length !== 1 || declaredPair.length !== 1) {
    throw new Error('P1.12 robots not-found pair invalid');
  }
  const parsed = parseP112RobotsDirective(declaredPair[0]!);
  if (parsed.index || parsed.follow) throw new Error('P1.12 robots not-found pair invalid');
  return parsed;
}

export function isExpectedP112MissingDocumentConsole(input: {
  text: string;
  url: string;
  routePath: string;
  expectedStatus: number;
}): boolean {
  if (
    input.expectedStatus !== 404 ||
    input.text !== 'Failed to load resource: the server responded with a status of 404 (Not Found)'
  ) {
    return false;
  }
  try {
    const location = new URL(input.url);
    return (
      location.origin === P112_TARGET.appOrigin &&
      `${location.pathname}${location.search}` === input.routePath
    );
  } catch {
    return false;
  }
}

export function resolveP112Redirect(location: string, currentUrl: string): string {
  const target = new URL(location, currentUrl);
  if (target.origin !== P112_TARGET.appOrigin || !['http:', 'https:'].includes(target.protocol)) {
    throw new Error('P1.12 redirect origin rejected');
  }
  return target.href;
}

type AxeFinding = { id: string; impact?: string | null; nodes: Array<{ target: unknown[] }> };

export function dispositionP112AxeFindings(findings: readonly AxeFinding[]) {
  const values = new Map<
    string,
    { fingerprint: string; disposition: 'must-fix-before-acceptance' }
  >();
  for (const finding of findings) {
    for (const node of finding.nodes) {
      const target = node.target.map(String).join(' > ');
      const fingerprint = `${finding.id}|${finding.impact ?? 'unknown'}|${target}`;
      values.set(fingerprint, { fingerprint, disposition: 'must-fix-before-acceptance' });
    }
  }
  return [...values.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint),
  );
}
