export function isNormalizedOwnedStoragePath(
  path: string,
  tenantId: string,
  companyScope: string,
): boolean {
  if (
    !path ||
    !tenantId ||
    !companyScope ||
    tenantId.includes('/') ||
    companyScope.includes('/') ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('%') ||
    /[\u0000-\u001f\u007f]/u.test(path)
  ) {
    return false;
  }
  const segments = path.split('/');
  return (
    segments.length >= 3 &&
    segments[0] === tenantId &&
    segments[1] === companyScope &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..') &&
    segments.join('/') === path
  );
}
