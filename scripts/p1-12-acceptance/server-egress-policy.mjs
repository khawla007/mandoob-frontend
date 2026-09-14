const BLOG_COLUMNS =
  'id,slug,title,excerpt,content_json,content_html,status,published_at,scheduled_for,meta_title,meta_description,canonical_url,noindex,featured_media_id,author_id,created_by,updated_by,deleted_at,created_at,updated_at';
const CMS_COLUMNS =
  'id,slug,title,content_json,content_html,hero_settings,background_image_media_id,status,published_at,scheduled_for,meta_title,meta_description,canonical_url,noindex,schema_markup,script_head,script_body_start,script_body_end,created_at,updated_at';
const isoDate = (name) => ({ name, prefix: 'lte.', format: 'iso-date-time' });
const blogListQuery = [
  { name: 'select', value: BLOG_COLUMNS },
  { name: 'status', value: 'eq.published' },
  { name: 'deleted_at', value: 'is.null' },
  { name: 'published_at', value: 'not.is.null' },
  isoDate('published_at'),
  { name: 'order', value: 'published_at.desc' },
];
const blogDetailQuery = (slugs) => [
  { name: 'select', value: BLOG_COLUMNS },
  { name: 'slug', oneOf: slugs.map((slug) => `eq.${slug}`) },
  { name: 'status', value: 'eq.published' },
  { name: 'deleted_at', value: 'is.null' },
  { name: 'published_at', value: 'not.is.null' },
  isoDate('published_at'),
];
const cmsDetailQuery = (slugs) => [
  { name: 'select', value: CMS_COLUMNS },
  { name: 'slug', oneOf: slugs.map((slug) => `eq.${slug}`) },
  { name: 'status', value: 'eq.published' },
  { name: 'deleted_at', value: 'is.null' },
  isoDate('published_at'),
];
const cmsListQuery = [
  { name: 'select', value: 'slug,updated_at,noindex' },
  { name: 'status', value: 'eq.published' },
  { name: 'deleted_at', value: 'is.null' },
  isoDate('published_at'),
  { name: 'order', value: 'updated_at.desc,slug.asc' },
];
const lockoutReadQuery = [
  { name: 'select', value: '*' },
  { name: 'key', format: 'lockout-key' },
];
const lockoutUpsertQuery = [{ name: 'on_conflict', value: 'key' }];
const accountLockoutDeleteQuery = [{ name: 'key', format: 'account-lockout-key' }];
const mfaProfileReadQuery = [
  { name: 'select', oneOf: ['locale', 'full_name', 'mfa_enrolled_at', 'role,status,tenant_id'] },
  { name: 'id', format: 'eq-uuid' },
];
const userIdQuery = [{ name: 'user_id', format: 'eq-uuid' }];
const recoveryCodeInsertQuery = [{ name: 'columns', value: '"user_id","code_hash"' }];
const profileMfaUpdateQuery = [
  { name: 'id', format: 'eq-uuid' },
  { name: 'select', value: 'id' },
];
const publicRead = (stateId, path, queryShape, profile = 'production') => ({
  stateId,
  profile,
  initiator: 'app',
  category: 'postgrest',
  method: 'GET',
  path,
  queryShape,
  statuses: [200],
});
const auth = (stateId, method, path, statuses) => ({
  stateId,
  profile: 'production',
  initiator: 'app',
  category: 'auth',
  method,
  path,
  ...(path === '/auth/v1/token' ? { query: 'grant_type=password' } : {}),
  statuses,
});
const rest = (stateId, method, path, statuses) => ({
  stateId,
  profile: 'production',
  initiator: 'app',
  category: 'postgrest',
  method,
  path,
  statuses,
});

const NEXT_DEVELOPMENT_VERSION_CHECK = 'https://registry.npmjs.org/-/package/next/dist-tags';

export function isP112BlockedNextDevelopmentVersionCheck(method, value, nodeEnv) {
  return (
    nodeEnv === 'development' &&
    method.toUpperCase() === 'GET' &&
    String(value) === NEXT_DEVELOPMENT_VERSION_CHECK
  );
}

/** Frozen, enumerable server/fixture egress tuples. Absence is denial. */
export const P112_SERVER_EGRESS_POLICY = [
  publicRead('S003', '/rest/v1/cms_pages', cmsDetailQuery(['privacy'])),
  publicRead('S024', '/rest/v1/blog_posts', blogListQuery),
  publicRead('S025', '/rest/v1/blog_posts', blogListQuery, 'blog-empty'),
  publicRead('S026', '/rest/v1/blog_posts', blogListQuery),
  publicRead('S027', '/rest/v1/blog_posts', blogListQuery, 'blog-unavailable'),
  publicRead('S028', '/rest/v1/blog_posts', blogDetailQuery(['p1-12-public-fixture'])),
  publicRead(
    'S029',
    '/rest/v1/blog_posts',
    blogDetailQuery(['p1-12-public-fixture']),
    'blog-detail-unavailable',
  ),
  publicRead('S030', '/rest/v1/blog_posts', blogDetailQuery(['p1-12-missing'])),
  publicRead('S038', '/rest/v1/cms_pages', cmsDetailQuery(['privacy', 'terms', 'pdpl', 'trust'])),
  publicRead(
    'S038',
    '/rest/v1/cms_pages',
    cmsDetailQuery(['evidence-editorial-page']),
    'route-retry',
  ),
  publicRead('S039', '/rest/v1/cms_pages', cmsDetailQuery(['privacy']), 'legal-unavailable'),
  publicRead('S040', '/rest/v1/cms_pages', cmsDetailQuery(['p1-12-missing'])),
  publicRead(
    'S134',
    '/rest/v1/cms_pages',
    cmsDetailQuery(['evidence-editorial-page']),
    'route-error',
  ),
  publicRead(
    'S135',
    '/rest/v1/cms_pages',
    cmsDetailQuery(['evidence-editorial-page']),
    'route-retry',
  ),
  publicRead('S136', '/rest/v1/blog_posts', blogListQuery),
  {
    stateId: 'S136',
    profile: 'production',
    initiator: 'app',
    category: 'postgrest',
    method: 'GET',
    path: '/rest/v1/cms_pages',
    queryShapes: [cmsListQuery, cmsDetailQuery(['privacy', 'terms', 'pdpl', 'trust'])],
    statuses: [200],
  },

  auth('S080', 'POST', '/auth/v1/token', [200, 400]),
  auth('S081', 'POST', '/auth/v1/token', [400]),
  auth('S082', 'POST', '/auth/v1/token', [200]),
  auth('S082', 'POST', '/auth/v1/logout', [204]),
  rest('S080', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  rest('S081', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  rest('S082', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  {
    ...rest('S081', 'GET', '/rest/v1/auth_failed_attempts', [200, 406]),
    queryShape: lockoutReadQuery,
  },
  {
    ...rest('S081', 'POST', '/rest/v1/auth_failed_attempts', [200, 201]),
    queryShape: lockoutUpsertQuery,
  },
  rest('S081', 'POST', '/rest/v1/auth_events', [201]),
  rest('S082', 'POST', '/rest/v1/auth_events', [201]),

  ...['S128', 'S138', 'S142'].flatMap((stateId) => [
    rest(stateId, 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
    {
      ...rest(stateId, 'GET', '/rest/v1/auth_failed_attempts', [200]),
      queryShape: lockoutReadQuery,
    },
    auth(stateId, 'POST', '/auth/v1/token', [200]),
    {
      ...rest(stateId, 'DELETE', '/rest/v1/auth_failed_attempts', [204]),
      queryShape: accountLockoutDeleteQuery,
    },
    rest(stateId, 'POST', '/rest/v1/auth_events', [201]),
    auth(stateId, 'GET', '/auth/v1/user', [200]),
    { ...rest(stateId, 'GET', '/rest/v1/profiles', [200]), queryShape: mfaProfileReadQuery },
  ]),

  rest('S087', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  rest('S087', 'GET', '/rest/v1/tenants', [200]),
  rest('S087', 'POST', '/rest/v1/tenants', [201]),
  auth('S087', 'POST', '/auth/v1/admin/users', [200, 422]),
  auth('S087', 'DELETE', '/auth/v1/admin/users/:userId', [200]),
  rest('S087', 'POST', '/rest/v1/profiles', [201]),
  auth('S088', 'POST', '/auth/v1/admin/users', [422]),
  rest('S089', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  auth('S090', 'POST', '/auth/v1/admin/users', [400, 422]),
  auth('S090', 'DELETE', '/auth/v1/admin/users/:userId', [200]),

  rest('S097', 'GET', '/rest/v1/invites', [200]),
  rest('S098', 'GET', '/rest/v1/invites', [200]),
  rest('S098', 'PATCH', '/rest/v1/invites', [204]),
  rest('S098', 'POST', '/rest/v1/profiles', [201]),
  auth('S098', 'POST', '/auth/v1/admin/users', [200, 422]),
  auth('S098', 'PUT', '/auth/v1/admin/users/:userId', [200]),
  auth('S098', 'DELETE', '/auth/v1/admin/users/:userId', [200]),
  rest('S099', 'GET', '/rest/v1/invites', [200]),

  rest('S103', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  auth('S103', 'POST', '/auth/v1/verify', [200, 401]),
  auth('S104', 'POST', '/auth/v1/verify', [401, 422]),
  rest('S105', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  auth('S106', 'POST', '/auth/v1/otp', [200, 429]),
  auth('S107', 'POST', '/auth/v1/verify', [200]),
  auth('S107', 'PUT', '/auth/v1/admin/users/:userId', [200]),
  rest('S107', 'PATCH', '/rest/v1/profiles', [204]),
  rest('S107', 'POST', '/rest/v1/auth_events', [201]),

  rest('S110', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  auth('S110', 'POST', '/auth/v1/recover', [200]),
  auth('S111', 'POST', '/auth/v1/recover', [200]),
  rest('S111', 'POST', '/rest/v1/auth_events', [201]),
  rest('S112', 'POST', '/rest/v1/rpc/rate_limit_consume', [200]),
  auth('S113', 'POST', '/auth/v1/recover', [400, 429]),

  auth('S116', 'GET', '/auth/v1/user', [200, 401]),
  auth('S116', 'PUT', '/auth/v1/user', [200, 401, 409]),
  auth('S117', 'GET', '/auth/v1/user', [401]),
  auth('S118', 'GET', '/auth/v1/user', [200]),
  auth('S118', 'PUT', '/auth/v1/user', [200]),
  auth('S118', 'POST', '/auth/v1/logout', [204]),
  rest('S118', 'POST', '/rest/v1/auth_events', [201]),
  auth('S119', 'GET', '/auth/v1/user', [200, 401]),
  auth('S119', 'PUT', '/auth/v1/user', [400, 409]),

  auth('S122', 'GET', '/auth/v1/user', [200]),
  auth('S122', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S122', 'POST', '/auth/v1/factors/:factorId/verify', [200, 422]),
  auth('S123', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S123', 'POST', '/auth/v1/factors/:factorId/verify', [422]),
  auth('S124', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S124', 'POST', '/auth/v1/factors/:factorId/verify', [200]),
  auth('S125', 'POST', '/auth/v1/factors/:factorId/challenge', [400, 404]),
  auth('S127', 'GET', '/auth/v1/user', [200, 401]),
  auth('S128', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S128', 'POST', '/auth/v1/factors/:factorId/verify', [200, 422]),
  auth('S128', 'POST', '/auth/v1/factors', [200]),
  { ...rest('S128', 'DELETE', '/rest/v1/user_mfa_recovery_codes', [204]), queryShape: userIdQuery },
  {
    ...rest('S128', 'POST', '/rest/v1/user_mfa_recovery_codes', [201]),
    queryShape: recoveryCodeInsertQuery,
  },
  { ...rest('S128', 'PATCH', '/rest/v1/profiles', [200]), queryShape: profileMfaUpdateQuery },
  auth('S128', 'POST', '/auth/v1/admin/users/:userId/logout', [200, 204]),
  auth('S129', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S129', 'POST', '/auth/v1/factors/:factorId/verify', [200, 422]),
  auth('S130', 'POST', '/auth/v1/factors/:factorId/challenge', [404]),
  auth('S131', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S131', 'POST', '/auth/v1/factors/:factorId/verify', [200]),
  auth('S132', 'POST', '/auth/v1/factors/:factorId/challenge', [400, 404]),
  auth('S139', 'GET', '/auth/v1/user', [200]),
  auth('S139', 'DELETE', '/auth/v1/factors/:factorId', [200]),
  auth('S139', 'POST', '/auth/v1/factors', [200]),
  auth('S143', 'GET', '/auth/v1/user', [200]),
  auth('S142', 'POST', '/auth/v1/factors/:factorId/challenge', [200]),
  auth('S142', 'POST', '/auth/v1/factors/:factorId/verify', [200, 422]),
  auth('S142', 'POST', '/auth/v1/factors', [200]),
  { ...rest('S142', 'DELETE', '/rest/v1/user_mfa_recovery_codes', [204]), queryShape: userIdQuery },
  {
    ...rest('S142', 'POST', '/rest/v1/user_mfa_recovery_codes', [201]),
    queryShape: recoveryCodeInsertQuery,
  },
  { ...rest('S142', 'PATCH', '/rest/v1/profiles', [200]), queryShape: profileMfaUpdateQuery },
  auth('S142', 'POST', '/auth/v1/admin/users/:userId/logout', [200, 204]),
  auth('S145', 'GET', '/auth/v1/user', [200]),
  auth('S146', 'GET', '/auth/v1/user', [200]),

  {
    stateId: 'fixture-baseline',
    profile: 'fixture',
    initiator: 'fixture',
    category: 'database',
    method: 'CONNECT',
    path: '/postgres',
    statuses: ['connected'],
  },
];

function matchPath(pattern, actual) {
  const wanted = pattern.split('/');
  const received = actual.split('/');
  return (
    wanted.length === received.length &&
    wanted.every((part, index) =>
      part.startsWith(':') ? received[index]?.length > 0 : part === received[index],
    )
  );
}

function matchesQueryPart(rule, value) {
  if ('value' in rule) return value === rule.value;
  if ('oneOf' in rule) return rule.oneOf.includes(value);
  if (rule.format === 'iso-date-time' && value.startsWith(rule.prefix)) {
    const candidate = value.slice(rule.prefix.length);
    try {
      return new Date(candidate).toISOString() === candidate;
    } catch {
      return false;
    }
  }
  if (rule.format === 'lockout-key') {
    return /^eq\.(?:acct:[^@\s]+@[^\s]+|net:(?:(?:\d{1,3}\.){3}0\/24|[0-9a-f:]+::\/64))$/iu.test(
      value,
    );
  }
  if (rule.format === 'account-lockout-key') {
    return /^eq\.acct:[^@\s]+@[^\s]+$/iu.test(value);
  }
  if (rule.format === 'eq-uuid') {
    return /^eq\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    );
  }
  return false;
}

function matchesQuery(rule, rawQuery) {
  const shapes = rule.queryShapes ?? (rule.queryShape ? [rule.queryShape] : null);
  if (shapes) {
    const received = [...new URLSearchParams(rawQuery).entries()];
    return shapes.some(
      (shape) =>
        received.length === shape.length &&
        shape.every(
          (part, index) =>
            received[index]?.[0] === part.name && matchesQueryPart(part, received[index][1]),
        ),
    );
  }
  return (rule.query ?? '') === rawQuery;
}

export function matchP112ServerEgressRule(input) {
  return P112_SERVER_EGRESS_POLICY.find(
    (rule) =>
      rule.stateId === input.stateId &&
      rule.profile === input.profile &&
      rule.initiator === input.initiator &&
      rule.method === input.method.toUpperCase() &&
      matchPath(rule.path, input.path) &&
      matchesQuery(rule, input.query ?? ''),
  );
}

/** Reconciles sanitized evidence after the preload has already enforced the exact query. */
export function matchP112ObservedEgressRule(input) {
  return P112_SERVER_EGRESS_POLICY.find(
    (rule) =>
      rule.stateId === input.stateId &&
      rule.profile === input.profile &&
      rule.initiator === input.initiator &&
      rule.method === input.method.toUpperCase() &&
      matchPath(rule.path, input.path),
  );
}
