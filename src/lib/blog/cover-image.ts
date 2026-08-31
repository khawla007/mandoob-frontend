const BLOG_COVERS = {
  businessSetup: {
    src: '/home-reference/business-setup-hd.png',
    alt: 'Dubai skyline across the waterfront',
  },
  freeZone: {
    src: '/home-reference/free-zone-hd.png',
    alt: 'Modern Dubai business district at sunset',
  },
  proServices: {
    src: '/home-reference/pro-services-hd.png',
    alt: 'Business documents and pen on a desk',
  },
  vatRegistration: {
    src: '/home-reference/vat-registration-hd.png',
    alt: 'UAE finance documents, calculator, and magnifying glass',
  },
} as const;

export function getBlogCoverImage(title: string, slug = '') {
  const topic = `${title} ${slug}`.toLowerCase();

  if (/\b(vat|tax|fiscal)\b/u.test(topic)) return BLOG_COVERS.vatRegistration;
  if (/\bfree[ -]?zone\b/u.test(topic)) return BLOG_COVERS.freeZone;
  if (/\b(pro services?|documents?|visa|compliance|renewals?)\b/u.test(topic)) {
    return BLOG_COVERS.proServices;
  }

  return BLOG_COVERS.businessSetup;
}
