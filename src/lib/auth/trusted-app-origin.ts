import 'server-only';

const LOCAL_APPLICATION_ORIGIN = 'http://localhost:3001';

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/u.test(hostname)
  );
}

function isExplicitLocalAcceptanceOrigin(configured: string): boolean {
  return (
    (process.env.P112_ACCEPTANCE_LOCAL_ONLY === '1' && configured === 'http://127.0.0.1:3001') ||
    (process.env.P2_ACCEPTANCE_LOCAL_ONLY === '1' && configured === 'http://127.0.0.1:3100')
  );
}

function trustedApplicationOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_APP_URL is required in production');
    }
    return LOCAL_APPLICATION_ORIGIN;
  }

  try {
    const url = new URL(configured);
    const isAllowedProtocol =
      url.protocol === 'https:' ||
      isExplicitLocalAcceptanceOrigin(configured) ||
      (process.env.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        isLoopbackHostname(url.hostname));
    if (isAllowedProtocol && !url.username && !url.password) {
      return url.origin;
    }
  } catch {
    // Handled below.
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL must be an HTTPS origin without credentials');
  }
  return LOCAL_APPLICATION_ORIGIN;
}

/** Builds an absolute URL without consulting request Host or proxy headers. */
export function trustedApplicationUrl(path: string): URL {
  const localPath =
    path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/';
  return new URL(`${trustedApplicationOrigin()}${localPath}`);
}
