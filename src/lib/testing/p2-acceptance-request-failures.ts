export type FailedRequestDetails = {
  errorText: string;
  resourceType: string;
  isNavigationRequest: boolean;
  url: string;
  headers: Record<string, string>;
};

export function isExpectedNextPrefetchAbort(
  request: FailedRequestDetails,
  expectedOrigin: string,
): boolean {
  const prefetchMarker =
    request.headers['next-router-prefetch'] === '1' ||
    request.headers.purpose === 'prefetch' ||
    request.headers['sec-purpose'] === 'prefetch';

  return (
    request.errorText === 'net::ERR_ABORTED' &&
    request.resourceType === 'fetch' &&
    !request.isNavigationRequest &&
    new URL(request.url).origin === expectedOrigin &&
    prefetchMarker
  );
}
