const PROD_HOST_DENY_LIST = ['mandoob.com', 'mandoob.io', 'mandoob.ae', 'mandoob-app.netlify.app'];

function normalizeHost(value) {
  if (typeof value !== 'string') return '';

  const input = value.trim();
  if (!input) return '';

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
    const parsed = parseUrl(input);
    return parsed ? parsed.host : '';
  }

  const authority = parseAuthority(input);
  return authority ? authority.host : '';
}

function parseUrl(value) {
  if (/\s/.test(value)) return null;

  const match = /^(https?):\/\/([^/?#]+)(\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/i.exec(value);
  if (!match) return null;

  const authority = parseAuthority(match[2]);
  if (!authority) return null;
  if (
    [match[3], match[4], match[5]].some(
      (part) => part !== undefined && /%(?![\da-f]{2})/i.test(part),
    )
  ) {
    return null;
  }

  const protocol = match[1].toLowerCase();
  const portNumber = authority.port ? Number(authority.port) : 0;
  const port =
    authority.port &&
    !((protocol === 'http' && portNumber === 80) || (protocol === 'https' && portNumber === 443))
      ? `:${portNumber}`
      : '';
  const path = (match[3] || '').replace(/\/+$/, '');
  const query = match[4] === undefined ? '' : `?${match[4]}`;
  const fragment = match[5] === undefined ? '' : `#${match[5]}`;

  return {
    protocol,
    host: authority.host,
    canonical: `${protocol}://${authority.host}${port}${path}${query}${fragment}`,
  };
}

function parseAuthority(value) {
  if (!value || value.includes('@')) return null;
  if (value[0] === '[') return null;

  let host = value;
  let port = '';

  const firstColon = value.indexOf(':');
  if (firstColon >= 0) {
    if (value.indexOf(':', firstColon + 1) >= 0) return null;
    host = value.slice(0, firstColon);
    port = value.slice(firstColon + 1);
    if (!/^\d+$/.test(port)) return null;
  }

  if (!isValidHostname(host)) return null;

  if (port && Number(port) > 65535) return null;
  return { host: host.toLowerCase().replace(/\.$/, ''), port };
}

function isValidHostname(host) {
  const normalizedHost = host.toLowerCase().replace(/\.$/, '');
  if (!normalizedHost || normalizedHost.length > 253) return false;

  const labels = normalizedHost.split('.');
  if (!labels.every((label) => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))) {
    return false;
  }

  if (labels.length === 4 && labels.every((label) => /^\d+$/.test(label))) {
    return labels.every((label) => Number(label) <= 255);
  }

  return labels.every((label) => label.length <= 63);
}

function isProductionHost(host) {
  const normalizedHost = normalizeHost(host);
  return PROD_HOST_DENY_LIST.some(
    (blockedHost) => normalizedHost === blockedHost || normalizedHost.endsWith(`.${blockedHost}`),
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
    normalizedHost.endsWith('.local') ||
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

  return parsedUrl.canonical;
}

export { resolveBaseUrl, isProductionHost, isExplicitlyAllowedHost, PROD_HOST_DENY_LIST };
