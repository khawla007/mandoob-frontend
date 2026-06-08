import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  matcher: [
    '/',
    '/ar',
    '/ar/:path*',
    '/pricing',
    '/pricing/:path*',
    '/estimate',
    '/estimate/:path*',
    '/knowledge-base',
    '/knowledge-base/:path*',
    '/legal',
    '/legal/:path*',
    '/company-setup',
    '/company-setup/:path*',
    '/apply',
    '/apply/:path*',
  ],
};
