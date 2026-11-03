export const PUBLIC_NAV_ITEMS = [
  {
    id: 'businessSetup',
    href: '/business-registration',
    currentPath: '/business-registration',
    children: [
      {
        id: 'businessRegistration',
        href: '/business-registration',
        currentPath: '/business-registration',
      },
      { id: 'mainland', href: '/mainland', currentPath: '/mainland' },
      { id: 'freeZones', href: '/free-zones', currentPath: '/free-zones' },
      { id: 'offshore', href: '/offshore', currentPath: '/offshore' },
      { id: 'costEstimator', href: '/estimate', currentPath: '/estimate' },
      { id: 'howItWorks', href: '/how-it-works', currentPath: '/how-it-works' },
    ],
  },
  { id: 'proServices', href: '/pro-services', currentPath: '/pro-services' },
  {
    id: 'resources',
    href: '/knowledge-base',
    currentPath: '/knowledge-base',
    children: [
      { id: 'knowledgeBase', href: '/knowledge-base', currentPath: '/knowledge-base' },
      { id: 'guides', href: '/guides', currentPath: '/guides' },
      {
        id: 'documentRequirements',
        href: '/document-requirements',
        currentPath: '/document-requirements',
      },
      { id: 'faq', href: '/faq', currentPath: '/faq' },
      { id: 'blog', href: '/blog', currentPath: '/blog' },
    ],
  },
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
