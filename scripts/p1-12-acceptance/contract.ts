export const P112_TARGET = {
  projectId: 'mandoob-p1-12-acceptance',
  networkName: 'supabase_network_mandoob-p1-12-acceptance',
  appOrigin: 'http://127.0.0.1:3001',
  apiOrigin: 'http://127.0.0.1:56321',
  databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:56322/postgres',
  studioOrigin: 'http://127.0.0.1:56323',
  inbucketOrigin: 'http://127.0.0.1:56324',
  analyticsPort: 56327,
  poolerPort: 56329,
  inspectorPort: 56383,
  shadowPort: 56320,
  databaseContainer: 'supabase_db_mandoob-p1-12-acceptance',
} as const;

export const P112_FIXTURE = {
  userAlias: 'mfa-user',
  publishedPostAlias: 'published-blog-post',
  publishedPostId: '11200000-0000-4000-8000-000000000001',
  publishedPostSlug: 'p1-12-public-fixture',
  unpublishedPostAlias: 'unpublished-blog-post',
  unpublishedPostId: '11200000-0000-4000-8000-000000000002',
  unpublishedPostSlug: 'p1-12-unpublished-fixture',
} as const;

export const P112_BASELINE = {
  authUsers: 0,
  profiles: 0,
  mfaFactors: 0,
  recoveryCodes: 0,
  authEvents: 0,
  authFailedAttempts: 0,
  rateLimits: 0,
  blogMedia: 0,
  blogPosts: 0,
  blogTerms: 0,
  blogPostTerms: 0,
  blogPostGalleryItems: 0,
  blogPostRevisions: 0,
  cmsPages: 4,
  storageObjects: 0,
  cmsPageSlugs: ['pdpl', 'privacy', 'terms', 'trust'],
  cmsPagesAreLivePublished: true,
} as const;
