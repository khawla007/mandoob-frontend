import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.29.189', '192.168.29.189.nip.io', '*.192.168.29.189.nip.io'],
  experimental: {
    // Preserve the 10 MiB credential-evidence file plus its bounded multipart envelope.
    proxyClientMaxBodySize: 11 * 1024 * 1024,
    serverActions: {
      // The app accepts 8 MiB images; 1 MiB covers multipart/action framing overhead.
      bodySizeLimit: '9mb',
    },
  },
};

export default withNextIntl(nextConfig);
