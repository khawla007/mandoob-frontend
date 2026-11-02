export const PUBLIC_NAV_ITEMS = [
  {
    id: 'businessSetup',
    href: '/business-setup',
    currentPath: '/business-setup',
    children: [
      { id: 'businessRegistration', href: '/business-setup', currentPath: '/business-setup' },
      { id: 'costEstimator', href: '/estimate', currentPath: '/estimate' },
    ],
  },
  { id: 'mainland', href: '/mainland', currentPath: '/mainland' },
  { id: 'freeZones', href: '/free-zones', currentPath: '/free-zones' },
  { id: 'offshore', href: '/offshore', currentPath: '/offshore' },
  { id: 'howItWorks', href: '/how-it-works', currentPath: '/how-it-works' },
  { id: 'knowledgeBase', href: '/knowledge-base', currentPath: '/knowledge-base' },
  { id: 'aboutUs', href: '/about', currentPath: '/about' },
  { id: 'contactUs', href: '/contact', currentPath: '/contact' },
] as const;

export type PublicNavChildLink = {
  id: string;
  href: string;
  label: string;
  currentPath?: string;
};

export type PublicNavLink = {
  id: (typeof PUBLIC_NAV_ITEMS)[number]['id'];
  href: string;
  label: string;
  currentPath?: string;
  children?: readonly PublicNavChildLink[];
};

export function isPublicNavCurrent(currentPath: string | undefined, pathname: string): boolean {
  return currentPath !== undefined && currentPath === pathname;
}
