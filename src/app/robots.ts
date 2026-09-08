import type { MetadataRoute } from 'next';

import { PUBLIC_SITE_ORIGIN } from '@/lib/public-metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: new URL('/sitemap.xml', PUBLIC_SITE_ORIGIN).href,
    host: PUBLIC_SITE_ORIGIN.origin,
  };
}
