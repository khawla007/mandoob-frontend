const PROD_HOST_DENY_LIST = ['mandoob.com', 'mandoob.io'];

function normalizeHost(value) {
  if (typeof value !== 'string') return '';

  let host = value.trim().toLowerCase();
  if (!host) return '';

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(host)) {
    const parsed = parseUrl(host);
    host = parsed ? parsed.host : '';
  }

  return host.replace(/:\d+$/, '').replace(/\.$/, '');
}

function parseUrl(value) {
  const match = /^(https?):\/\/([^/?#\s]+)(?:\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i.exec(
    value,
  );
  if (!match) return null;

  const authority = match[2];
  if (authority.includes('@')) return null;

  let host = authority;
  const portIndex = authority.lastIndexOf(':');
  if (portIndex > -1 && authority[0] !== '[') {
    const port = authority.slice(portIndex + 1);
    if (!/^\d+$/.test(port) || Number(port) > 65535) return null;
    host = authority.slice(0, portIndex);
  }

  if (!host || /[\s[\]]/.test(host)) return null;
  return { protocol: `${match[1].toLowerCase()}:`, host: host.toLowerCase() };
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
  const parsedUrl = parseUrl(rawUrl);
  if (!parsedUrl) {
    throw new Error(`K6_BASE_URL is not a valid URL: ${rawUrl}`);
  }

  const host = normalizeHost(parsedUrl.host);
  if (isProductionHost(host)) {
    throw new Error(`K6_BASE_URL points to a host on the production deny list: ${host}`);
  }

  if (!isExplicitlyAllowedHost(host, env.STAGING_HOST)) {
    throw new Error(`K6_BASE_URL host is not in the allow list: ${host}`);
  }

  return rawUrl.replace(/\/+$/, '');
}

export {
  resolveBaseUrl,
  isProductionHost,
  isExplicitlyAllowedHost,
  PROD_HOST_DENY_LIST,
};
