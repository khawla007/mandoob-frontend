const baseUrl = process.env.LAUNCH_BASE_URL || 'http://localhost:3100';
const launchUrl = new URL(baseUrl);
const launchRootDomain = launchUrl.host;
const launchPort = launchUrl.port || '3000';

module.exports = {
  ci: {
    collect: {
      startServerCommand: process.env.LAUNCH_SKIP_WEB_SERVER
        ? undefined
        : `NEXT_PUBLIC_ROOT_DOMAIN=${launchRootDomain} npm run dev -- -p ${launchPort}`,
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 120000,
      url: [`${baseUrl}/`, `${baseUrl}/estimate`, `${baseUrl}/pricing`, `${baseUrl}/login`],
      numberOfRuns: 1,
      settings: {
        preset: 'desktop',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: './.lighthouseci',
    },
  },
};
