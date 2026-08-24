import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { ProLifecycleIdentity } from '@/lib/data/pro-lifecycle-identity';
import { ApiError } from '@/lib/errors';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 13).toString('base64');

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PRO_ID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL_ID = '33333333-3333-4333-8333-333333333333';
const EVIDENCE_ID = '44444444-4444-4444-8444-444444444444';
const OPERATION_ID = '55555555-5555-4555-8555-555555555555';
const CANARIES = [
  'TASK13-CANARY-IDENTIFIER-9Z72',
  'v1:TASK13-CANARY-CIPHERTEXT',
  'TASK13-CANARY-HASH-0123456789',
  'pro-credentials/TASK13-CANARY-STORAGE-PATH',
  'https://storage.invalid/TASK13-CANARY-SIGNED-URL',
  'TASK13-CANARY-RAW-PROVIDER-ERROR',
] as const;

const identity: ProLifecycleIdentity = {
  profile: {
    id: PRO_ID,
    fullName: 'Synthetic PRO',
    email: 'synthetic@example.invalid',
    emailUnavailable: false,
    accountStatus: 'active',
    designation: null,
    department: null,
    serviceAreas: [],
    bio: null,
    createdAt: '2026-08-24T00:00:00.000Z',
  },
  eligibility: {
    eligible: false,
    codes: ['PRO_CREDENTIAL_MISSING'],
    verifiedCredentialId: null,
    pricingTermId: null,
    compensationTermId: null,
  },
  assignment: null,
};

function assertCanariesAbsent(label: string, value: unknown) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const canary of CANARIES)
    assert.equal(serialized.includes(canary), false, `${label}: ${canary}`);
}

function localImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  for (const pattern of [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier?.startsWith('@/') || specifier?.startsWith('.')) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function resolveLocalImport(importer: string, specifier: string): string | null {
  const unresolved = specifier.startsWith('@/')
    ? join('src', specifier.slice(2))
    : normalize(join(dirname(importer), specifier));
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.js`,
    `${unresolved}.jsx`,
    `${unresolved}.cjs`,
    `${unresolved}.mjs`,
    `${unresolved}.json`,
    `${unresolved}.css`,
    join(unresolved, 'index.ts'),
    join(unresolved, 'index.tsx'),
    join(unresolved, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runtimeImportClosure(roots: readonly string[]) {
  const closure = new Set<string>();
  const unresolved: string[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || closure.has(file)) continue;
    closure.add(file);
    if (!/\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const specifier of localImportSpecifiers(source)) {
      const resolved = resolveLocalImport(file, specifier);
      if (!resolved) unresolved.push(`${file} -> ${specifier}`);
      else if (!closure.has(resolved)) pending.push(resolved);
    }
  }
  return { files: [...closure].sort(), unresolved: unresolved.sort() };
}

function runtimeSourceFiles(directory = 'src'): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...runtimeSourceFiles(path));
    else if (
      /\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(path) &&
      !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(path) &&
      !/\.d\.ts$/u.test(path)
    )
      files.push(path);
  }
  return files.sort();
}

function discoverStep3RuntimeRoots(runtimeFiles = runtimeSourceFiles()): string[] {
  return [...new Set(runtimeFiles)].sort();
}

if (process.env.PRO_LIFECYCLE_CANARY_RENDER_STATE) {
  test('actual recovery component renders only sanitized orchestration state', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ProLifecycleRecoveryPanel } =
      await import('@/components/admin/ProLifecycleRecoveryPanel');
    const state = JSON.parse(process.env.PRO_LIFECYCLE_CANARY_RENDER_STATE ?? '{}') as {
      credentialState: { kind: string };
      termsState: { kind: string };
      timelineState: { kind: string };
    };
    const panels = [
      [state.credentialState, 'Credential'],
      [state.termsState, 'Commercial terms'],
      [state.timelineState, 'Lifecycle history'],
    ] as const;
    const html = renderToStaticMarkup(
      React.createElement(
        'main',
        null,
        panels.map(([source, title]) =>
          source.kind === 'error'
            ? React.createElement(ProLifecycleRecoveryPanel, {
                key: title,
                title,
                description: `${title} is temporarily unavailable.`,
                retryLabel: `Retry ${title}`,
                formLabel: `Retry loading ${title}`,
                action: `/admin/users/${PRO_ID}`,
              })
            : null,
        ),
      ),
    );
    assert.match(html, /role="status"/u);
    assertCanariesAbsent('rendered HTML', html);
  });
} else {
  test('protected producer output is rejected before RSC props and actual rendered HTML', async () => {
    const [{ readProCredentialSnapshot }, { loadProLifecyclePage }] = await Promise.all([
      import('@/lib/data/pro-credentials'),
      import('@/app/admin/users/[id]/page-orchestration'),
    ]);
    await assert.rejects(
      readProCredentialSnapshot(ACTOR_ID, PRO_ID, {
        supabase: {
          async rpc() {
            return {
              data: {
                credentials: [
                  {
                    credentialId: CREDENTIAL_ID,
                    type: 'pro_license',
                    maskedIdentifier: '•••• 9Z72',
                    issuingAuthority: 'Synthetic Authority',
                    issueDate: '2026-01-01',
                    expiryDate: '2027-01-01',
                    state: 'draft',
                    version: 0,
                    evidenceCount: 1,
                    submittedAt: null,
                    supersedesCredentialId: null,
                    identifier: CANARIES[0],
                    identifierCiphertext: CANARIES[1],
                    identifierHash: CANARIES[2],
                  },
                ],
                evidence: [
                  {
                    evidenceId: EVIDENCE_ID,
                    credentialId: CREDENTIAL_ID,
                    mimeType: 'application/pdf',
                    sizeBytes: 8,
                    originalNameSafe: 'licence.pdf',
                    createdAt: '2026-08-24T00:00:00.000Z',
                    storagePath: CANARIES[3],
                    signedUrl: CANARIES[4],
                    sha256: CANARIES[2],
                  },
                ],
              },
              error: null,
            };
          },
        } as never,
      }),
      (error: unknown) =>
        error instanceof ApiError && !CANARIES.some((value) => error.message.includes(value)),
    );

    const rawFailure = new Error(CANARIES.join(' '));
    const rscProps = await loadProLifecyclePage(ACTOR_ID, PRO_ID, null, {
      identity: async () => identity,
      credential: async () => Promise.reject(rawFailure),
      terms: async () => Promise.reject(rawFailure),
      timeline: async () => Promise.reject(rawFailure),
    });
    assertCanariesAbsent('RSC props', rscProps);
    assert.deepEqual(
      [rscProps.credentialState.kind, rscProps.termsState.kind, rscProps.timelineState.kind],
      ['error', 'error', 'error'],
    );

    const renderEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      PRO_LIFECYCLE_CANARY_RENDER_STATE: JSON.stringify(rscProps),
    };
    delete renderEnvironment.NODE_TEST_CONTEXT;
    const rendered = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
        env: renderEnvironment,
      },
    );
    assert.equal(rendered.status, 0, `${rendered.stdout}\n${rendered.stderr}`);
    assertCanariesAbsent('render process output', `${rendered.stdout}\n${rendered.stderr}`);
  });

  test('actual route, action, log, and URL boundaries exclude protected producer inputs', async () => {
    const [{ createAdminCredentialPostHandler }, routes, actions, companyActions] =
      await Promise.all([
        import('@/app/api/v1/admin/users/[id]/credentials/route'),
        import('@/app/api/v1/_shared/pro-lifecycle-routes'),
        import('@/lib/actions/server-action-security'),
        import('@/app/admin/companies/action-logic'),
      ]);
    const rawFailure = new Error(CANARIES.join(' '));
    const response = await createAdminCredentialPostHandler({
      guardCsrf: async () => null,
      requireOperator: async () => ({
        id: ACTOR_ID,
        role: 'admin',
        tenantId: null,
        aal: 'aal2',
        mfaEnrolled: true,
        email: null,
      }),
      resolveTarget: async () => ({ proProfileId: PRO_ID, credentialIds: [CREDENTIAL_ID] }),
      limit: async () => 'allowed',
      review: async () => ({
        credentialId: CREDENTIAL_ID,
        type: 'pro_license',
        maskedIdentifier: '•••• 9Z72',
        issuingAuthority: 'Synthetic Authority',
        issueDate: '2026-01-01',
        expiryDate: '2027-01-01',
        state: 'verified',
        version: 2,
        evidenceCount: 1,
        submittedAt: '2026-08-24T00:00:00.000Z',
        supersedesCredentialId: null,
        identifier: CANARIES[0],
        identifierCiphertext: CANARIES[1],
        identifierHash: CANARIES[2],
        storagePath: CANARIES[3],
        signedUrl: CANARIES[4],
        rawError: CANARIES[5],
      }),
      revalidate: () => undefined,
    })(
      new Request('http://localhost/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'verify',
          credentialId: CREDENTIAL_ID,
          expectedVersion: 1,
          operationId: OPERATION_ID,
        }),
      }),
      { params: Promise.resolve({ id: PRO_ID }) },
    );

    const logs: unknown[] = [];
    const originalError = console.error;
    console.error = (...values: unknown[]) => logs.push(...values);
    let actionState: unknown;
    try {
      const data = new FormData();
      data.set('companyId', '66666666-6666-4666-8666-666666666666');
      data.set('proProfileId', PRO_ID);
      actionState = await companyActions.runAssignCompanyProAction(data, {
        requireActor: async () => ({ id: ACTOR_ID, role: 'admin', aal: 'aal2' }),
        getCompany: async () => ({
          id: '66666666-6666-4666-8666-666666666666',
          tenantId: '77777777-7777-4777-8777-777777777777',
          tenantSlug: 'synthetic-company',
          companyName: 'Synthetic Company',
        }),
        limitAssignment: async () => 'allowed',
        assign: async () => Promise.reject(rawFailure),
        revalidate: () => undefined,
        reportError: actions.logSafeActionError,
      } as never);
    } finally {
      console.error = originalError;
    }

    const routeJson = await response.text();
    const errorJson = await routes.lifecycleErrorResponse(rawFailure, 'task13-canary').text();
    const urls = routes.buildLifecycleRevalidationPaths(
      { proProfileId: PRO_ID, credentialIds: [CREDENTIAL_ID], companyId: null, tenantSlug: null },
      PRO_ID,
    );
    assert.equal(response.status, 500);
    for (const [label, value] of Object.entries({ routeJson, errorJson, actionState, logs, urls }))
      assertCanariesAbsent(label, value);
  });

  test('lifecycle runtime inventory is independent of Git history and fixed file counts', () => {
    const inventorySource = `${runtimeSourceFiles.toString()}\n${discoverStep3RuntimeRoots.toString()}`;
    assert.doesNotMatch(inventorySource, /\bgit\b|[0-9a-f]{40}|\.\.HEAD|changedRuntimeEntries/u);
    assert.match(inventorySource, /runtimeSourceFiles/u);
  });

  test('runtime inventory audits framework entries and uncommitted convention files without keywords', () => {
    const runtimeFiles = [
      'src/app/layout.tsx',
      'src/app/admin/users/error.tsx',
      'src/app/admin/users/loading.tsx',
      'src/app/synthetic-segment/loading.tsx',
    ];
    const roots = discoverStep3RuntimeRoots(runtimeFiles);
    assert.deepEqual(roots, runtimeFiles.slice().sort());
  });

  test('lifecycle runtime graph has no analytics, screenshot, or report-evidence persistence adapter', () => {
    const runtimeRoots = discoverStep3RuntimeRoots();
    assert.notEqual(runtimeRoots.length, 0);
    for (const root of runtimeRoots) assert.equal(existsSync(root), true, root);
    const graph = runtimeImportClosure(runtimeRoots);
    assert.deepEqual(graph.unresolved, []);
    assert.equal(
      runtimeRoots.every((file) => graph.files.includes(file)),
      true,
    );
    assert.equal(graph.files.length >= runtimeRoots.length, true);
    for (const file of graph.files.filter((candidate) =>
      /\.(?:ts|tsx|js|jsx|cjs|mjs)$/u.test(candidate),
    )) {
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(
        source,
        /(?:from\s*|import\s*\()\s*['"][^'"]*(?:analytics|telemetry|posthog|segment|sentry|datadog|playwright|puppeteer|screenshot)[^'"]*['"]/iu,
        file,
      );
      assert.doesNotMatch(
        source,
        /\b(?:analytics|telemetry|posthog|segment|sentry)\s*(?:\.|\()/iu,
        file,
      );
      assert.doesNotMatch(
        source,
        /(?:\.|\b)(?:track|trackEvent|capture|captureEvent|captureException|recordEvent|sendBeacon|screenshot|takeScreenshot|saveScreenshot|persistEvidence|saveEvidence|writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|attach)\s*\(/iu,
        file,
      );
    }
  });
}
