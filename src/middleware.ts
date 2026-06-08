import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    '/',
    '/ar',
    '/ar/:path*',
    '/pricing/:path*',
    '/estimate/:path*',
    '/knowledge-base/:path*',
    '/legal/:path*',
    '/company-setup/:path*',
    '/apply/:path*',
  ],
};
