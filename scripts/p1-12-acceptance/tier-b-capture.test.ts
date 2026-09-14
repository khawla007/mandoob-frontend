import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

import { assertP112CapturePrivacy, buildP112CapturePlan, P112_TIER_B_TARGETS } from './tier-b';

let subject: typeof import('./tier-b-capture') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  subject = require('./tier-b-capture') as typeof import('./tier-b-capture');
} catch {
  // The first TDD run deliberately reaches the assertion without an implementation module.
}

test('captures only the exact reviewed state as a full-page DSF-1 PNG without browser chrome', async () => {
  assert.ok(subject, 'Tier B capture implementation module must exist');
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'p112-capture-'));
  const capture = buildP112CapturePlan().find(
    ({ targetId, theme, viewport }) =>
      targetId === 'home-ready' && theme === 'light' && viewport.width === 1440,
  )!;
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId)!;
  const signingKey = 'a'.repeat(64);
  const proof = subject.createP112CapturePreparationProof({
    target,
    preparedBy: 'tier-b-direct',
    preparedAt: '2026-09-09T00:00:00.000Z',
    source: 'tier-a-route:S007',
    nonce: 'b'.repeat(32),
    signingKey,
    observations: {
      responseStatus: 200,
      finalUrl: 'http://127.0.0.1:3001/',
      stateSelectors: [{ selector: '.hero', count: 1, visibleCount: 1 }],
      enabledControlCount: 4,
      documentStatus: 'complete',
    },
  });
  const calls: Record<string, unknown>[] = [];
  const png = makePng(1440, 2200);
  const lifecycle: string[] = [];
  const page = {
    url: () => 'http://127.0.0.1:3001/',
    viewportSize: () => ({ width: 1440, height: 900 }),
    waitForLoadState: async (state?: string) => {
      lifecycle.push(`load:${state}`);
    },
    evaluate: async (_callback: unknown, argument?: unknown) => {
      if (typeof argument === 'string') {
        lifecycle.push('decoded');
        return { width: 1440, height: 2200 };
      }
      lifecycle.push('assets-settled');
      return {
        deviceScaleFactor: 1,
        language: 'en',
        direction: 'ltr',
        theme: 'light',
        visibleText: 'UAE company setup',
        visibleControlData: [],
        visibleSecretSelectors: [],
        brokenImages: [],
        browserStateMarker: {
          stateId: target.stateId,
          fixtureAlias: target.fixtureAlias,
          nonce: proof.nonce,
          signature: proof.signature,
        },
        stateObservations: proof.observations,
      };
    },
    screenshot: async (options: Record<string, unknown>) => {
      calls.push(options);
      return png;
    },
  };

  const result = await subject.captureP112Screenshot(page, capture, outputRoot, {
    proof,
    signingKey,
    forbiddenFixtureValues: [],
  });
  assert.deepEqual(calls, [
    {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
      scale: 'device',
    },
  ]);
  assert.deepEqual(result.fullPageDimensions, { width: 1440, height: 2200 });
  assert.deepEqual(result.imageDecode, {
    engine: 'chromium',
    result: 'pass',
    width: 1440,
    height: 2200,
  });
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(lifecycle, ['load:networkidle', 'assets-settled', 'decoded']);
  assert.equal((await readFile(path.join(outputRoot, capture.relativePath))).length, png.length);
});

test('rejects route, viewport, DSF, locale, direction, theme, and privacy drift before capture', async () => {
  assert.ok(subject, 'Tier B capture implementation module must exist');
  const capture = buildP112CapturePlan()[0]!;
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId)!;
  const signingKey = 'a'.repeat(64);
  const proof = subject.createP112CapturePreparationProof({
    target,
    preparedBy: 'tier-b-direct',
    preparedAt: '2026-09-09T00:00:00.000Z',
    source: 'tier-a-route:S007',
    nonce: 'b'.repeat(32),
    signingKey,
    observations: {
      responseStatus: 200,
      finalUrl: 'http://127.0.0.1:3001/',
      stateSelectors: [{ selector: '.hero', count: 1, visibleCount: 1 }],
      enabledControlCount: 4,
      documentStatus: 'complete',
    },
  });
  const baseline = {
    deviceScaleFactor: 1,
    language: 'en',
    direction: 'ltr',
    theme: capture.theme,
    visibleText: 'Safe public copy',
    visibleControlData: [] as string[],
    visibleSecretSelectors: [] as string[],
    brokenImages: [] as string[],
    browserStateMarker: {
      stateId: target.stateId,
      fixtureAlias: target.fixtureAlias,
      nonce: proof.nonce,
      signature: proof.signature,
    },
    stateObservations: proof.observations,
  };
  const cases = [
    { url: 'http://127.0.0.1:3001/about', viewport: capture.viewport, runtime: baseline },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: { width: 1, height: 1 },
      runtime: baseline,
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, deviceScaleFactor: 2 },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, language: 'ar' },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, direction: 'rtl' },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, theme: capture.theme === 'light' ? 'dark' : 'light' },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, visibleText: 'person@example.com' },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, visibleControlData: ['value=person@example.com'] },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: { ...baseline, brokenImages: ['img:0'] },
    },
    {
      url: `http://127.0.0.1:3001${capture.route}`,
      viewport: capture.viewport,
      runtime: {
        ...baseline,
        stateObservations: { ...proof.observations, stateSelectors: [] },
      },
    },
  ];
  for (const example of cases) {
    let called = false;
    await assert.rejects(
      subject.captureP112Screenshot(
        {
          url: () => example.url,
          viewportSize: () => example.viewport,
          waitForLoadState: async () => undefined,
          evaluate: async (_callback: unknown, argument?: unknown) =>
            typeof argument === 'string'
              ? { width: capture.viewport.width, height: capture.viewport.height + 100 }
              : example.runtime,
          screenshot: async () => {
            called = true;
            return Buffer.alloc(0);
          },
        },
        capture,
        '/tmp/p112-never-written',
        { proof, signingKey, forbiddenFixtureValues: [] },
      ),
      /P1\.12/u,
    );
    assert.equal(called, false);
  }
  await assert.rejects(
    subject.captureP112Screenshot(
      {
        url: () => `http://127.0.0.1:3001${capture.route}`,
        viewportSize: () => capture.viewport,
        waitForLoadState: async () => undefined,
        evaluate: async (_callback: unknown, argument?: unknown) =>
          typeof argument === 'string'
            ? { width: capture.viewport.width, height: capture.viewport.height + 100 }
            : baseline,
        screenshot: async () => Buffer.alloc(0),
      },
      capture,
      '/tmp/p112-never-written',
      {
        proof: { ...proof, fixtureAlias: 'invented' },
        signingKey,
        forbiddenFixtureValues: [],
      },
    ),
    /preparation proof/u,
  );
  await assert.rejects(
    subject.captureP112Screenshot(
      {
        url: () => `http://127.0.0.1:3001${capture.route}`,
        viewportSize: () => capture.viewport,
        waitForLoadState: async () => undefined,
        evaluate: async () => ({ ...baseline, browserStateMarker: null }),
        screenshot: async () => Buffer.alloc(0),
      },
      capture,
      '/tmp/p112-never-written',
      { proof, signingKey, forbiddenFixtureValues: [] },
    ),
    /browser state marker/u,
  );
});

test('limits broad canvas QR scanning to MFA enrollment and permits S142 home decoration', async () => {
  assert.ok(subject);
  const initial = P112_TIER_B_TARGETS.find(({ stateId }) => stateId === 'S138')!;
  const completed = P112_TIER_B_TARGETS.find(({ stateId }) => stateId === 'S142')!;
  assert.equal(subject.shouldScanP112MfaEnrollmentSurfaces(initial), true);
  assert.equal(subject.shouldScanP112MfaEnrollmentSurfaces(completed), false);
  const fabricSource = await readFile('src/components/FabricBackground.tsx', 'utf8');
  assert.match(fabricSource, /createElement\('canvas'\)/u);
  assert.throws(
    () =>
      assertP112CapturePrivacy({
        stateId: 'S140',
        visibleText: '',
        visibleSelectors: ['<canvas data-testid="mfa-qr">'],
      }),
    /never be captured/u,
  );
});

function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1);
  const image = Buffer.concat(Array.from({ length: height }, () => scanline));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(image)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  body.copy(result, 4);
  result.writeUInt32BE(crc32(body), data.length + 8);
  return result;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
