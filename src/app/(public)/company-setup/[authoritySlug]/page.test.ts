import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveAuthoritySourcePresentation } from '@/lib/public-content/development-evidence';

const source = readFileSync('src/app/(public)/company-setup/[authoritySlug]/page.tsx', 'utf8');

test('pure authority resolution owns metadata and presentation semantics', () => {
  const unavailable = resolveAuthoritySourcePresentation({
    authoritySlug: 'dmcc',
    pageExists: true,
    nodeEnv: 'development',
    mode: 'authority-source-unavailable',
  });
  assert.deepEqual(unavailable, {
    status: 'unavailable',
    metadata: {
      title: 'Authority guide unavailable',
      description: 'This authority setup guide is temporarily unavailable.',
      canonical: '/company-setup/dmcc',
    },
  });
  assert.equal(
    resolveAuthoritySourcePresentation({
      authoritySlug: 'dmcc',
      pageExists: true,
      nodeEnv: 'production',
      mode: 'authority-source-unavailable',
    }).status,
    'ready',
  );
  assert.equal(
    resolveAuthoritySourcePresentation({
      authoritySlug: 'dmcc',
      pageExists: true,
      nodeEnv: undefined,
      mode: 'authority-source-unavailable',
    }).status,
    'ready',
  );
  assert.equal(
    resolveAuthoritySourcePresentation({
      authoritySlug: 'adgm',
      pageExists: true,
      nodeEnv: 'development',
      mode: 'authority-source-unavailable',
    }).status,
    'ready',
  );
  assert.equal(
    resolveAuthoritySourcePresentation({
      authoritySlug: 'missing',
      pageExists: false,
      nodeEnv: 'development',
      mode: 'authority-source-unavailable',
    }).status,
    'missing',
  );
});

test('authority source-unavailable evidence is development-only and preserves true missing behavior', () => {
  assert.match(source, /export const dynamicParams = false/u);
  assert.match(source, /resolveAuthoritySourcePresentation/u);
  assert.match(source, /nodeEnv:\s*process\.env\.NODE_ENV/u);
  assert.match(source, /mode:\s*process\.env\.P112_AUTHORITY_EVIDENCE_STATE/u);
  assert.match(source, /pageExists/u);
  assert.equal(
    source.match(/if \(!page \|\| presentation\.status === 'missing'\) notFound\(\)/gu)?.length,
    2,
  );
});

test('authority unavailable metadata is canonical, noindex/nofollow, and has no Open Graph claim', () => {
  assert.match(source, /buildUnavailableMetadata\(presentation\.metadata\)/u);
});

test('authority unavailable body is distinct, safe, retryable, and emitted before JSON-LD', () => {
  const unavailableBranch = source.indexOf(
    "if (presentation.status === 'unavailable')",
    source.indexOf('export default'),
  );
  const jsonLd = source.indexOf('<JsonLd', unavailableBranch);

  assert.ok(unavailableBranch >= 0);
  assert.ok(jsonLd > unavailableBranch);
  assert.match(
    source.slice(unavailableBranch, jsonLd),
    /<PublicContentState[\s\S]*eyebrow="Authority guide unavailable"[\s\S]*title="This authority setup guide could not be loaded\."[\s\S]*No estimated fees, timeline, documents, or internal error details are being shown\.[\s\S]*recoveryHref=\{`\/company-setup\/\$\{encodeURIComponent\(authoritySlug\)\}`\}[\s\S]*recoveryLabel="Try again"[\s\S]*retry[\s\S]*headingLevel="h1"/u,
  );
});

test('authority facts render only after an approved catalog match', () => {
  assert.match(source, /listPublicCatalog\('authorities'/u);
  assert.match(source, /catalog\.state !== 'ready'/u);
  assert.match(source, /catalogAuthority\.name !== page\.authority/u);
  assert.match(source, /catalogAuthority\.jurisdiction !== page\.jurisdiction/u);
  assert.doesNotMatch(source, /catalog\.reason/u);
});
