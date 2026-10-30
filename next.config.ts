import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.29.189', '192.168.29.189.nip.io', '*.192.168.29.189.nip.io'],
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    // Preserve the 25 MiB document file plus its bounded multipart envelope.
    proxyClientMaxBodySize: 26 * 1024 * 1024,
    serverActions: {
      // The app accepts 8 MiB images; 1 MiB covers multipart/action framing overhead.
      bodySizeLimit: '9mb',
    },
  },
};

export default withNextIntl(nextConfig);
