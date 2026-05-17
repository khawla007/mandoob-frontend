export function buildTenantPath(slug: string, path = '/'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath === '/' ? `/t/${slug}` : `/t/${slug}${cleanPath}`;
}

export function buildTenantUrl({
  slug,
  rootDomain,
  path = '/',
}: {
  slug: string;
  rootDomain: string;
  path?: string;
}): string {
  const protocol = rootDomain.startsWith('localhost') || rootDomain.startsWith('127.0.0.1')
    ? 'http'
    : 'https';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${protocol}://${slug}.${rootDomain}${cleanPath}`;
}
