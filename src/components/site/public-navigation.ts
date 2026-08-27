export const PUBLIC_NAV_ITEMS = [
  { id: 'platform', href: '/#services', currentPath: '/' },
  { id: 'estimate', href: '/estimate', currentPath: '/estimate' },
  { id: 'customers', href: '/#customers' },
  { id: 'forPros', href: '/pro', currentPath: '/pro' },
  { id: 'pricing', href: '/pricing', currentPath: '/pricing' },
] as const;

export type PublicNavLink = {
  id: (typeof PUBLIC_NAV_ITEMS)[number]['id'];
  href: string;
  label: string;
  currentPath?: string;
};

export function isPublicNavCurrent(currentPath: string | undefined, pathname: string): boolean {
  return currentPath !== undefined && currentPath === pathname;
}
