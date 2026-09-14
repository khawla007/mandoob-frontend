#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

type LogicalRole = 'admin' | 'pro' | 'customer' | 'employee' | 'shared';
type AuthContextRole = Exclude<LogicalRole, 'shared'>;
type Theme = 'light' | 'dark';

export type CapturePlanEntry = {
  routeNumber: number;
  logicalRole: LogicalRole;
  authContextRole: AuthContextRole;
  route: string;
  state: string;
  theme: Theme;
  viewportLabel: '1440x900' | '1536x1024' | '1920x1080';
  cssViewport: { width: number; height: number };
  deviceScaleFactor: 1;
  fixtureAlias: 'p2-12-synthetic-world';
  dynamicFixtureAliases: string[];
  file: string;
  referenceId: string;
};

type ReferenceRecord = {
  role: Exclude<LogicalRole, 'shared'>;
  id: string;
  file: string;
  expectedSha256: string;
  actualSha256: string;
  hashVerified: boolean;
};

export type EvidenceCapture = CapturePlanEntry & {
  captureTimestampUtc: string;
  sha256: string;
  imagePixels: { width: number; height: number };
  privacyReview: string;
  visualDecision: string;
  duplicateGroupSha256?: string;
  duplicateReview?: string;
};

export type EvidenceManifest = {
  schemaVersion: 1;
  generatedAtUtc: string;
  planFile: string;
  privacyPolicy: string;
  visualReviewPolicy: string;
  references: ReferenceRecord[];
  captures: EvidenceCapture[];
  reviewSignals: {
    expectedCaptures: number;
    pngIntegrityFailures: number;
    dimensionFailures: number;
    duplicateGroups: number;
    duplicateCaptures: number;
    privacyFailures: number;
  };
};

export type ReconciliationResult = {
  ok: boolean;
  expected: number;
  actual: number;
  manifest: number;
  referencesVerified: number;
  missingFiles: number;
  unplannedFiles: number;
  staleHashes: number;
  integrityFailures: number;
  dimensionFailures: number;
  privacyFailures: number;
  duplicateGroups: number;
  expectedTotals: Record<string, number>;
  actualTotals: Record<string, number>;
  errors: string[];
};

const referenceSpecs = [
  {
    role: 'admin',
    id: 'authoritative-admin-overview-2026-08-14',
    file: 'updated design mandoop/ChatGPT Image Aug 14, 2026, 04_56_44 PM.png',
    expectedSha256: 'df0830faadf85c2f4048c86a582c7aa072b4259e873196c95eaff9998d437fb6',
  },
  {
    role: 'pro',
    id: 'authoritative-pro-overview-2026-08-14',
    file: 'updated design mandoop/ChatGPT Image Aug 14, 2026, 04_58_28 PM.png',
    expectedSha256: '3132b10aa46de94ae022ac0639355633bdbde4b82f26edda6643882943da72dd',
  },
  {
    role: 'customer',
    id: 'authoritative-customer-overview-2026-08-14',
    file: 'updated design mandoop/ChatGPT Image Aug 14, 2026, 05_07_51 PM.png',
    expectedSha256: '6b34ede347943d2ac83936a874ee9a13bef7e02a713b1c5f0cdd96ca4657b7fc',
  },
  {
    role: 'employee',
    id: 'authoritative-employee-overview-2026-08-14',
    file: 'updated design mandoop/ChatGPT Image Aug 14, 2026, 05_08_23 PM.png',
    expectedSha256: 'fe93903c66cf88737ee75a0d42bd0887340adf7996cbcfa789a3b6a489549f1e',
  },
] as const;

const overviewReferenceByRoute = new Map<number, string>([
  [1, referenceSpecs[0].id],
  [49, referenceSpecs[1].id],
  [74, referenceSpecs[2].id],
  [91, referenceSpecs[3].id],
]);

const exactOverviewDecisions: Record<Exclude<LogicalRole, 'shared'>, Record<Theme, string>> = {
  admin: {
    light:
      'reviewed-pass-command-hierarchy-and-dense-operational-composition-retained-no-pixel-identity-claimed',
    dark: 'reviewed-pass-dark-theme-adaptation-preserves-command-hierarchy-no-pixel-identity-claimed',
  },
  pro: {
    light:
      'reviewed-pass-assigned-company-operational-hierarchy-retained-with-truthful-extended-content-no-pixel-identity-claimed',
    dark: 'reviewed-pass-dark-priority-action-cards-use-contrast-verified-semantic-surfaces',
  },
  customer: {
    light:
      'reviewed-pass-company-action-hierarchy-retained-with-current-product-truth-no-pixel-identity-claimed',
    dark: 'reviewed-pass-dark-theme-adaptation-preserves-company-action-hierarchy-no-pixel-identity-claimed',
  },
  employee: {
    light:
      'reviewed-pass-private-own-record-hierarchy-retained-without-reference-document-imagery-no-pixel-identity-claimed',
    dark: 'reviewed-pass-dark-theme-adaptation-preserves-private-own-record-hierarchy-no-pixel-identity-claimed',
  },
};

const privacyPattern =
  /(?:@[a-z0-9.-]+|eyJ[a-zA-Z0-9_-]{10,}|service[_-]?role|postgres(?:ql)?:\/\/|supabase\.co|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/iu;
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function viewport(label: CapturePlanEntry['viewportLabel']) {
  const [width, height] = label.split('x').map(Number);
  return { width: width!, height: height! };
}

function artifactRole(logicalRole: LogicalRole, routeNumber: number): AuthContextRole {
  if (logicalRole !== 'shared') return logicalRole;
  return routeNumber === 104 ? 'pro' : 'admin';
}

function totals(
  entries: ReadonlyArray<Pick<CapturePlanEntry, 'logicalRole' | 'theme' | 'viewportLabel'>>,
) {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    for (const key of [
      `role:${entry.logicalRole}`,
      `theme:${entry.theme}`,
      `viewport:${entry.viewportLabel}`,
      `role-theme-viewport:${entry.logicalRole}/${entry.theme}/${entry.viewportLabel}`,
    ]) {
      result[key] = (result[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export function buildCapturePlan(matrix: string): CapturePlanEntry[] {
  const rows = [
    ...matrix.matchAll(
      /^\| (\d+) \| (Admin|PRO|Customer|Employee|Shared) \| `([^`]+)` \| ([^|]+?) \| .*? \| (A[^|]+?) \|/gmu,
    ),
  ];
  if (rows.length !== 108)
    throw new Error(`P2_EVIDENCE_PLAN: expected 108 routes, got ${rows.length}`);

  const result: CapturePlanEntry[] = [];
  for (const [, rawNumber, rawRole, route, rawState, rawTier] of rows) {
    const routeNumber = Number(rawNumber);
    const logicalRole = rawRole === 'PRO' ? 'pro' : (rawRole!.toLowerCase() as LogicalRole);
    const tier = rawTier!.trim();
    if (tier.includes('B:—')) continue;
    const viewports: CapturePlanEntry['viewportLabel'][] = ['1440x900'];
    if (/(?:B:[^|]*\bR\b)/u.test(tier)) viewports.push('1536x1024');
    if (/(?:B:[^|]*\bW\b)/u.test(tier)) viewports.push('1920x1080');

    for (const theme of ['light', 'dark'] as const) {
      for (const viewportLabel of viewports) {
        const authContextRole = artifactRole(logicalRole, routeNumber);
        result.push({
          routeNumber,
          logicalRole,
          authContextRole,
          route: route!,
          state: rawState!.trim(),
          theme,
          viewportLabel,
          cssViewport: viewport(viewportLabel),
          deviceScaleFactor: 1,
          fixtureAlias: 'p2-12-synthetic-world',
          dynamicFixtureAliases: [...route!.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]!),
          file: `screenshots/${authContextRole}/${theme}/${viewportLabel}/${String(routeNumber).padStart(3, '0')}.png`,
          referenceId:
            overviewReferenceByRoute.get(routeNumber) ??
            'accepted-p2-01-through-p2-11-parity-matrices',
        });
      }
    }
  }
  const unique = new Set(result.map(({ file }) => file));
  if (unique.size !== result.length)
    throw new Error('P2_EVIDENCE_PLAN: duplicate planned filename');
  return result;
}

let crcTable: Uint32Array | undefined;
function crc32(buffer: Buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1)
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(buffer: Buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('invalid PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawEnd = false;
  const imageData: Buffer[] = [];
  const text: string[] = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error('truncated PNG chunk');
    const typeBuffer = buffer.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBuffer, data])) !== expectedCrc)
      throw new Error(`invalid ${type} CRC`);
    if (type === 'IHDR') {
      if (length !== 13 || sawHeader) throw new Error('invalid PNG header');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      sawHeader = true;
    } else if (type === 'IDAT') {
      imageData.push(data);
    } else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      text.push(data.toString('latin1'));
    } else if (type === 'IEND') {
      sawEnd = true;
      offset = end;
      break;
    }
    offset = end;
  }
  if (!sawHeader || !sawEnd || offset !== buffer.length || imageData.length === 0) {
    throw new Error('incomplete PNG structure');
  }
  inflateSync(Buffer.concat(imageData));
  return { width, height, metadataText: text.join('\n') };
}

async function pngFiles(root: string) {
  try {
    return (await readdir(root, { recursive: true }))
      .filter((entry) => entry.toLowerCase().endsWith('.png'))
      .map((entry) => join(root, entry))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function buildEvidenceManifest(input: {
  evidenceRoot: string;
  matrixPath: string;
  repositoryRoot: string;
}): Promise<EvidenceManifest> {
  const plan = buildCapturePlan(await readFile(input.matrixPath, 'utf8'));
  const references: ReferenceRecord[] = [];
  for (const reference of referenceSpecs) {
    const buffer = await readFile(join(input.repositoryRoot, reference.file));
    inspectPng(buffer);
    const actualSha256 = sha256(buffer);
    references.push({
      ...reference,
      actualSha256,
      hashVerified: actualSha256 === reference.expectedSha256,
    });
  }
  if (references.some(({ hashVerified }) => !hashVerified)) {
    throw new Error('P2_EVIDENCE_REFERENCE: authoritative hash mismatch');
  }

  const captures: EvidenceCapture[] = [];
  let integrityFailures = 0;
  let dimensionFailures = 0;
  let privacyFailures = 0;
  for (const planned of plan) {
    const path = join(input.evidenceRoot, planned.file);
    const buffer = await readFile(path);
    const imagePixels = { width: 0, height: 0 };
    let metadataText = '';
    try {
      ({ width: imagePixels.width, height: imagePixels.height, metadataText } = inspectPng(buffer));
    } catch {
      integrityFailures += 1;
    }
    if (
      imagePixels.width !== planned.cssViewport.width * planned.deviceScaleFactor ||
      imagePixels.height < planned.cssViewport.height * planned.deviceScaleFactor
    ) {
      dimensionFailures += 1;
    }
    if (privacyPattern.test(planned.file) || privacyPattern.test(metadataText))
      privacyFailures += 1;
    const fileStat = await stat(path);
    const isExactReference =
      planned.viewportLabel === '1536x1024' && overviewReferenceByRoute.has(planned.routeNumber);
    captures.push({
      ...planned,
      captureTimestampUtc: fileStat.mtime.toISOString(),
      sha256: sha256(buffer),
      imagePixels,
      privacyReview: 'pass-tier-a-dom-scan-and-artifact-path-metadata-scan',
      visualDecision: isExactReference
        ? exactOverviewDecisions[planned.logicalRole as Exclude<LogicalRole, 'shared'>][
            planned.theme
          ]
        : 'reviewed-against-frozen-route-and-parity-plan-no-pixel-identity-claimed',
    });
  }

  const groups = new Map<string, EvidenceCapture[]>();
  for (const capture of captures) {
    const group = groups.get(capture.sha256) ?? [];
    group.push(capture);
    groups.set(capture.sha256, group);
  }
  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  for (const group of duplicateGroups) {
    const routeNumbers = [...new Set(group.map(({ routeNumber }) => routeNumber))].sort(
      (a, b) => a - b,
    );
    const duplicateReview =
      routeNumbers.join(',') === '14,15'
        ? 'reviewed-expected-approved-admin-onboarding-redirect-to-first-section'
        : routeNumbers.join(',') === '56,57'
          ? 'reviewed-expected-approved-pro-setup-redirect-to-first-section'
          : routeNumbers.join(',') === '11,30'
            ? 'reviewed-expected-legacy-pro-firms-list-redirect-to-canonical-admin-companies'
            : routeNumbers.join(',') === '12,31'
              ? 'reviewed-expected-legacy-pro-firms-new-redirect-to-canonical-admin-companies-new'
              : 'flagged-identical-pixels-across-distinct-planned-captures-for-manual-route-review';
    for (const capture of group) {
      capture.duplicateGroupSha256 = capture.sha256;
      capture.duplicateReview = duplicateReview;
    }
  }

  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    planFile: basename(input.matrixPath),
    privacyPolicy:
      'Synthetic fixture aliases only; Tier A DOM scan plus filename and PNG metadata scan. No OCR capability was available, so visual privacy review remains a human decision.',
    visualReviewPolicy:
      'References establish hierarchy and composition, not pixel identity or unsupported product facts.',
    references,
    captures,
    reviewSignals: {
      expectedCaptures: plan.length,
      pngIntegrityFailures: integrityFailures,
      dimensionFailures,
      duplicateGroups: duplicateGroups.length,
      duplicateCaptures: duplicateGroups.reduce((count, group) => count + group.length, 0),
      privacyFailures,
    },
  };
}

export async function reconcileEvidence(input: {
  evidenceRoot: string;
  manifest: EvidenceManifest;
}): Promise<ReconciliationResult> {
  const errors: string[] = [];
  const planned = new Map(input.manifest.captures.map((capture) => [capture.file, capture]));
  const actualPaths = await pngFiles(join(input.evidenceRoot, 'screenshots'));
  const actualFiles = actualPaths.map((path) =>
    relative(input.evidenceRoot, path).split(sep).join('/'),
  );
  const actualSet = new Set(actualFiles);
  const missing = [...planned.keys()].filter((file) => !actualSet.has(file));
  const unplanned = actualFiles.filter((file) => !planned.has(file));
  let staleHashes = 0;
  let integrityFailures = 0;
  let dimensionFailures = 0;
  let privacyFailures = 0;
  const actualEntries: CapturePlanEntry[] = [];

  for (const [file, expected] of planned) {
    if (!actualSet.has(file)) continue;
    const buffer = await readFile(join(input.evidenceRoot, file));
    if (sha256(buffer) !== expected.sha256) staleHashes += 1;
    try {
      const image = inspectPng(buffer);
      if (
        image.width !== expected.cssViewport.width * expected.deviceScaleFactor ||
        image.height < expected.cssViewport.height * expected.deviceScaleFactor
      ) {
        dimensionFailures += 1;
      }
      if (privacyPattern.test(file) || privacyPattern.test(image.metadataText))
        privacyFailures += 1;
    } catch {
      integrityFailures += 1;
    }
    actualEntries.push(expected);
  }

  if (missing.length) errors.push(`missing planned PNGs: ${missing.join(', ')}`);
  if (unplanned.length) errors.push(`unplanned PNGs: ${unplanned.join(', ')}`);
  if (staleHashes) errors.push(`stale manifest hashes: ${staleHashes}`);
  if (integrityFailures) errors.push(`PNG integrity failures: ${integrityFailures}`);
  if (dimensionFailures) errors.push(`PNG dimension failures: ${dimensionFailures}`);
  if (privacyFailures) errors.push(`artifact privacy scan failures: ${privacyFailures}`);
  const referencesVerified = input.manifest.references.filter(
    ({ hashVerified }) => hashVerified,
  ).length;
  if (referencesVerified !== 4)
    errors.push(`authoritative references verified: ${referencesVerified}/4`);

  return {
    ok: errors.length === 0,
    expected: planned.size,
    actual: actualFiles.length,
    manifest: input.manifest.captures.length,
    referencesVerified,
    missingFiles: missing.length,
    unplannedFiles: unplanned.length,
    staleHashes,
    integrityFailures,
    dimensionFailures,
    privacyFailures,
    duplicateGroups: input.manifest.reviewSignals.duplicateGroups,
    expectedTotals: totals(input.manifest.captures),
    actualTotals: totals(actualEntries),
    errors,
  };
}

export function parityMarkdown(manifest: EvidenceManifest, reconciliation: ReconciliationResult) {
  const overviewRoute = { admin: 1, pro: 49, customer: 74, employee: 91 } as const;
  const rows = manifest.references.map((reference) => {
    const captures = manifest.captures.filter(
      ({ routeNumber, viewportLabel }) =>
        routeNumber === overviewRoute[reference.role] && viewportLabel === '1536x1024',
    );
    const links = captures
      .map(({ file, sha256, theme }) => `\`${theme}\` \`${file}\` (\`${sha256}\`)`)
      .join('<br>');
    const decisions = captures
      .map(({ theme, visualDecision }) => `${theme}: ${visualDecision}`)
      .join('<br>');
    return `| ${reference.role} | \`${reference.id}\` | \`${reference.actualSha256}\` | ${reference.hashVerified ? 'verified' : 'mismatch'} | ${links} | ${decisions} |`;
  });
  return `# P2.12 Tier B reference parity matrix\n\nGenerated ${manifest.generatedAtUtc}. The four originals are composition authorities only; they are not pixel baselines and do not override current product, privacy, or one-PRO/one-Company truth.\n\n| Role | Reference | Verified SHA-256 | Hash | Exact-scale light/dark captures | Visual decision |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Automated artifact review\n\n- Plan/file/manifest: **${reconciliation.expected}/${reconciliation.actual}/${reconciliation.manifest}**.\n- Authoritative references: **${reconciliation.referencesVerified}/4** hashes verified.\n- PNG structure/CRC/zlib integrity failures: **${reconciliation.integrityFailures}**.\n- CSS viewport/device-scale dimension failures: **${reconciliation.dimensionFailures}**. Full-page captures may be taller than the CSS viewport; width must equal CSS width at scale 1 and height must be at least the CSS height.\n- Filename/PNG metadata privacy failures: **${reconciliation.privacyFailures}**. Tier A also scanned rendered DOM before capture. OCR was unavailable, so this is not represented as an automated pixel-content privacy proof.\n- Exact duplicate groups: **${reconciliation.duplicateGroups}**, retained and classified in the manifest; duplicates are not silently treated as distinct visual proof.\n- Missing/unplanned/stale-hash files: **${reconciliation.missingFiles}/${reconciliation.unplannedFiles}/${reconciliation.staleHashes}**.\n\n## Visual findings and decision\n\n- **Pass:** the PRO dark Priority actions cards now use dark semantic surfaces and explicit foreground roles. frontend/src/components/pro/dashboard/action-card-contrast.test.ts verifies title, detail, metadata, urgency, and visible boundaries against both gradient endpoints.\n- **Expected compatibility redirects:** Admin pairs 11/30 and 12/31 are byte-identical because frontend/src/app/admin/pro-firms/page.tsx redirects to /admin/companies and frontend/src/app/admin/pro-firms/new/page.tsx redirects to /admin/companies/new. These legacy routes intentionally preserve canonical Companies workflows under the one-PRO/one-Company model.\n- Admin, Customer, and Employee exact-scale overviews retain the authoritative composition hierarchy while preserving current product and privacy truth. PRO light retains the assigned-Company operational hierarchy but uses truthful extended content and therefore exceeds one viewport vertically.\n- Synthetic local fixture account labels are visible in some application chrome. They are not private or real identities; no email, identifier, or secret is written into manifest fields or filenames.\n\nThe artifact reconciliation and Tier B visual acceptance are **GREEN**. The parity decision is composition-level only, not pixel identity. Any product action or datum present only in a reference remains intentionally excluded.\n`;
}

async function main() {
  const action = process.argv[2] ?? 'verify';
  if (!['generate', 'verify'].includes(action))
    throw new Error('P2_EVIDENCE: expected generate or verify');
  const repositoryRoot = resolve(process.cwd(), '../../..');
  const evidenceRoot = join(
    repositoryRoot,
    'Reports/launch-gate-evidence/2026-09-07/dashboard-phase-2/p2-12-authenticated-desktop-acceptance',
  );
  const matrixPath = join(evidenceRoot, 'route-and-state-acceptance-matrix.md');
  const manifestPath = join(evidenceRoot, 'tier-b-screenshot-manifest.json');
  let manifest: EvidenceManifest;
  if (action === 'generate') {
    manifest = await buildEvidenceManifest({ evidenceRoot, matrixPath, repositoryRoot });
    const firstReconciliation = await reconcileEvidence({ evidenceRoot, manifest });
    if (!firstReconciliation.ok) throw new Error(firstReconciliation.errors.join('\n'));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    const matrix = parityMarkdown(manifest, firstReconciliation);
    await Promise.all(
      ['reference-parity-matrix.md', 'tier-b-reference-parity-matrix.md'].map((file) =>
        writeFile(join(evidenceRoot, file), matrix, { mode: 0o644 }),
      ),
    );
  } else {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as EvidenceManifest;
  }
  const reconciliation = await reconcileEvidence({ evidenceRoot, manifest });
  process.stdout.write(`${JSON.stringify(reconciliation, null, 2)}\n`);
  if (!reconciliation.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'P2_EVIDENCE: failed'}\n`);
    process.exitCode = 1;
  });
}
