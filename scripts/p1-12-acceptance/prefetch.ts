import { p112DestinationProbeStrategy } from './browser-contract';
import { P112_TARGET } from './contract';

type P112PrefetchInput = {
  method: string;
  url: string;
  stateId: string;
  resourceType: string;
  headers: Record<string, string>;
};

function isP112BrowserPrefetch(input: P112PrefetchInput): boolean {
  const url = new URL(input.url);
  const signalled =
    input.headers['next-router-prefetch'] === '1' || input.headers.purpose === 'prefetch';
  return (
    input.method.toUpperCase() === 'GET' &&
    url.origin === P112_TARGET.appOrigin &&
    input.resourceType === 'fetch' &&
    signalled
  );
}

export function isP112DeclarativePrefetch(input: P112PrefetchInput): boolean {
  const url = new URL(input.url);
  return (
    isP112BrowserPrefetch(input) &&
    p112DestinationProbeStrategy(input.stateId, url.pathname) === 'declaration'
  );
}

export function isP112ExpectedBrowserPrefetchAbort(
  input: P112PrefetchInput & { allowed: boolean; failure: string },
): boolean {
  return input.allowed && input.failure === 'net::ERR_ABORTED' && isP112BrowserPrefetch(input);
}

export function isP112ExpectedSuppressedPrefetchConsoleError(input: {
  text: string;
  url: string;
  suppressedUrls: ReadonlySet<string>;
}): boolean {
  return (
    input.text === 'Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector' &&
    input.suppressedUrls.has(input.url)
  );
}
