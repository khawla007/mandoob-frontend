import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.29.189',
    '192.168.29.189.nip.io',
    '*.192.168.29.189.nip.io',
  ],
  experimental: {
    serverActions: {
      // The app accepts 8 MiB images; 1 MiB covers multipart/action framing overhead.
      bodySizeLimit: '9mb',
    },
  },
};

export default withNextIntl(nextConfig);
