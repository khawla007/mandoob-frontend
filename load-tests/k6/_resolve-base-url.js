const PROD_HOST_DENY_LIST = ['mandoob.com', 'mandoob.io'];

function normalizeHost(value) {
  if (typeof value !== 'string') return '';

  const input = value.trim();
  if (!input) return '';

  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
      ? input
      : `http://${input}`;
    return new URL(candidate).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return input.toLowerCase().replace(/\.$/, '');
  }
}

function isProductionHost(host) {
  const normalizedHost = normalizeHost(host);
  return PROD_HOST_DENY_LIST.some(
    (blockedHost) =>
      normalizedHost === blockedHost || normalizedHost.endsWith(`.${blockedHost}`),
  );
}

function isExplicitlyAllowedHost(host, override) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;

  const normalizedOverride = normalizeHost(override);
  if (normalizedOverride && normalizedHost === normalizedOverride) return true;

  return (
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.dev.local') ||
    normalizedHost.endsWith('.vercel.app')
  );
}

function resolveBaseUrl(options) {
  const env = (options && options.env) || {};
  const rawValue = env.K6_BASE_URL;
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    throw new Error('K6_BASE_URL is required');
  }

  const rawUrl = rawValue.trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`K6_BASE_URL is not a valid URL: ${rawUrl}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`K6_BASE_URL is not a valid URL: ${rawUrl}`);
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (isProductionHost(host)) {
    throw new Error(`K6_BASE_URL points to a host on the production deny list: ${host}`);
  }

  if (!isExplicitlyAllowedHost(host, env.STAGING_HOST)) {
    throw new Error(`K6_BASE_URL host is not in the allow list: ${host}`);
  }

  return parsedUrl.toString().replace(/\/+$/, '');
}

export {
  resolveBaseUrl,
  isProductionHost,
  isExplicitlyAllowedHost,
  PROD_HOST_DENY_LIST,
};
