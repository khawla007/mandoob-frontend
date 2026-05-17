import type { NextConfig } from 'next';
<<<<<<< HEAD
=======
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
>>>>>>> e7e69af (feat: add next-intl i18n infrastructure for Arabic + RTL)

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
