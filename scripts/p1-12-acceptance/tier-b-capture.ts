import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

import {
  assertP112CapturePrivacy,
  P112_TIER_B_TARGETS,
  validateP112CapturePreparationProof,
  type P112Capture,
  type P112CapturePreparationProof,
  type P112ImageDecode,
  type P112TierBTarget,
} from './tier-b';
import { assertP112NoSymlinkPath, writeP112AtomicPrivateFile } from './tier-b-fs';

export { createP112CapturePreparationProof } from './tier-b';

export function shouldScanP112MfaEnrollmentSurfaces(target: P112TierBTarget): boolean {
  return target.family === 'mfa-enroll' && target.route === '/mfa/enroll';
}

type CaptureRuntime = {
  deviceScaleFactor: number;
  language: string;
  direction: string;
  theme: string;
  visibleText: string;
  visibleControlData: string[];
  visibleSecretSelectors: string[];
  brokenImages: string[];
  browserStateMarker: {
    stateId: string;
    fixtureAlias: string;
    nonce: string;
    signature: string;
  } | null;
  stateObservations: P112CapturePreparationProof['observations'];
};

export type P112CapturePage = Pick<
  Page,
  'url' | 'viewportSize' | 'waitForLoadState' | 'evaluate' | 'screenshot'
>;

/**
 * Playwright-compatible retained capture adapter. Interaction setup and parity
 * judgment stay with their declared owners; this function enforces capture safety.
 */
export async function captureP112Screenshot(
  page: P112CapturePage,
  capture: P112Capture,
  outputRoot: string,
  options: {
    proof: P112CapturePreparationProof;
    signingKey: string;
    forbiddenFixtureValues: readonly string[];
  },
): Promise<{
  sha256: string;
  fullPageDimensions: { width: number; height: number };
  imageDecode: P112ImageDecode;
}> {
  const target = P112_TIER_B_TARGETS.find(({ id }) => id === capture.targetId);
  if (!target) throw new Error('P1.12 capture target is not frozen');
  validateP112CapturePreparationProof(options.proof, target, options.signingKey);
  const expectedUrl = new URL(capture.route, 'http://127.0.0.1:3001');
  const actualUrl = new URL(page.url());
  if (
    actualUrl.origin !== expectedUrl.origin ||
    actualUrl.pathname !== expectedUrl.pathname ||
    actualUrl.search !== expectedUrl.search ||
    actualUrl.hash !== '' ||
    actualUrl.username !== '' ||
    actualUrl.password !== ''
  ) {
    throw new Error('P1.12 capture route drift');
  }
  const viewport = page.viewportSize();
  if (
    !viewport ||
    viewport.width !== capture.viewport.width ||
    viewport.height !== capture.viewport.height
  ) {
    throw new Error('P1.12 capture viewport drift');
  }
  await page.waitForLoadState('networkidle');
  const runtime = await page.evaluate(
    async ({ scanMfaEnrollmentSurfaces, expected }): Promise<CaptureRuntime> => {
      const brokenImages: string[] = [];
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(innerHeight, 1)) {
        scrollTo(0, y);
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      scrollTo(0, 0);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      await Promise.all(
        [...document.images].map(async (image, index) => {
          if (!image.complete) {
            await new Promise<void>((resolve) => {
              const finish = () => {
                clearTimeout(timeout);
                image.removeEventListener('load', finish);
                image.removeEventListener('error', finish);
                resolve();
              };
              const timeout = setTimeout(finish, 5_000);
              image.addEventListener('load', finish, { once: true });
              image.addEventListener('error', finish, { once: true });
            });
          }
          if (!image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) {
            brokenImages.push(`img:${index}`);
            return;
          }
          try {
            await image.decode();
          } catch {
            brokenImages.push(`img:${index}`);
          }
        }),
      );
      await Promise.race([
        document.fonts.ready,
        new Promise<FontFaceSet>((_, reject) =>
          setTimeout(() => reject(new Error('P1.12 document fonts did not settle')), 5_000),
        ),
      ]);
      await Promise.race([
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('P1.12 animation frames did not settle')), 5_000),
        ),
      ]);
      const isVisible = (element: Element) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rectangle.width > 0 &&
          rectangle.height > 0
        );
      };
      const secretSelector = [
        '[data-testid*="mfa-qr" i]',
        '[data-testid*="qr-code" i]',
        '[data-testid*="manual-secret" i]',
        '[data-testid*="recovery-codes" i]',
        '[data-testid*="totp-secret" i]',
        '[id*="mfa-qr" i]',
        '[id*="manual-secret" i]',
        '[class*="recovery-codes" i]',
        'img[alt*="qr" i]',
        'img[src*="otpauth" i]',
        '[style*="otpauth" i]',
      ].join(',');
      const secretSurfaces = [...document.querySelectorAll(secretSelector)];
      if (scanMfaEnrollmentSurfaces) {
        secretSurfaces.push(...document.querySelectorAll('canvas, img[src^="data:image" i]'));
        secretSurfaces.push(
          ...[...document.querySelectorAll<HTMLElement>('*')].filter((element) =>
            getComputedStyle(element).backgroundImage.toLowerCase().includes('data:image'),
          ),
        );
      }
      const marker = document.querySelector<HTMLElement>(
        '[data-p112-state-id][data-p112-fixture-alias][data-p112-proof-nonce][data-p112-proof-signature]',
      );
      const visibleControlData = [
        ...document.querySelectorAll<HTMLElement>(
          'input,textarea,select,[placeholder],[title],[aria-label],[value]',
        ),
      ]
        .filter(isVisible)
        .flatMap((element) => {
          const values = ['placeholder', 'title', 'aria-label', 'value']
            .map((name) => {
              const value = element.getAttribute(name);
              return value ? `${name}:${value}` : null;
            })
            .filter((value): value is string => Boolean(value));
          if (
            element instanceof HTMLInputElement &&
            !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(element.type)
          )
            values.push(
              `${element.type}:${element.value}`,
              `name:${element.name}=${element.value}`,
            );
          if (element instanceof HTMLTextAreaElement)
            values.push(`textarea:${element.value}`, `name:${element.name}=${element.value}`);
          if (element instanceof HTMLSelectElement)
            values.push(
              `select:${element.value}`,
              `name:${element.name}=${element.value}`,
              ...[...element.selectedOptions].map((option) => option.text),
            );
          return values;
        });
      const stateSelectors = expected.stateSelectors.map(({ selector }) => {
        const elements = [...document.querySelectorAll(selector)];
        return {
          selector,
          count: elements.length,
          visibleCount: elements.filter(isVisible).length,
        };
      });
      const navigation = performance.getEntriesByType('navigation')[0] as
        | (PerformanceNavigationTiming & { responseStatus?: number })
        | undefined;
      return {
        deviceScaleFactor: window.devicePixelRatio,
        language: document.documentElement.lang,
        direction: document.documentElement.dir,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        visibleText: document.body.innerText,
        visibleControlData,
        visibleSecretSelectors: secretSurfaces
          .filter(isVisible)
          .map((element) => element.outerHTML.slice(0, 120)),
        brokenImages,
        browserStateMarker: marker
          ? {
              stateId: marker.dataset.p112StateId ?? '',
              fixtureAlias: marker.dataset.p112FixtureAlias ?? '',
              nonce: marker.dataset.p112ProofNonce ?? '',
              signature: marker.dataset.p112ProofSignature ?? '',
            }
          : null,
        stateObservations: {
          responseStatus: navigation?.responseStatus ?? 0,
          finalUrl: location.href,
          stateSelectors,
          enabledControlCount: document.querySelectorAll(
            'a[href]:not([aria-disabled="true"]),button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
          ).length,
          documentStatus: document.readyState === 'complete' ? 'complete' : ('loading' as never),
        },
      };
    },
    {
      scanMfaEnrollmentSurfaces: shouldScanP112MfaEnrollmentSurfaces(target),
      expected: options.proof.observations,
    },
  );
  if (runtime.deviceScaleFactor !== 1 || capture.dsf !== 1) {
    throw new Error('P1.12 capture DSF drift');
  }
  if (runtime.language !== 'en' || runtime.direction !== 'ltr') {
    throw new Error('P1.12 capture locale or direction drift');
  }
  if (runtime.theme !== capture.theme) throw new Error('P1.12 capture theme drift');
  if (
    !runtime.browserStateMarker ||
    runtime.browserStateMarker.stateId !== target.stateId ||
    runtime.browserStateMarker.fixtureAlias !== target.fixtureAlias ||
    runtime.browserStateMarker.nonce !== options.proof.nonce ||
    runtime.browserStateMarker.signature !== options.proof.signature
  ) {
    throw new Error('P1.12 browser state marker does not match preparation proof');
  }
  if (runtime.brokenImages.length > 0) throw new Error('P1.12 broken image asset detected');
  const screenshotStateDigest = createHash('sha256')
    .update(JSON.stringify(runtime.stateObservations))
    .digest('hex');
  if (screenshotStateDigest !== options.proof.stateDigest) {
    throw new Error('P1.12 screenshot-time DOM/state drift');
  }
  assertP112CapturePrivacy({
    stateId: capture.stateId,
    visibleText: runtime.visibleText,
    visibleSelectors: runtime.visibleSecretSelectors,
    forbiddenFixtureValues: options.forbiddenFixtureValues,
  });
  assertP112CapturePrivacy({
    stateId: capture.stateId,
    visibleText: runtime.visibleControlData.join('\n'),
    visibleSelectors: [],
    forbiddenFixtureValues: options.forbiddenFixtureValues,
  });

  const absolute = resolveInside(outputRoot, capture.relativePath);
  await assertP112NoSymlinkPath(outputRoot, absolute);
  await mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
  await assertP112NoSymlinkPath(outputRoot, absolute);
  const bytes = await page.screenshot({
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'device',
  });
  await writeP112AtomicPrivateFile(outputRoot, absolute, bytes);
  const fullPageDimensions = readPngDimensions(bytes);
  if (fullPageDimensions.width !== capture.viewport.width) {
    throw new Error('P1.12 retained PNG width does not match CSS viewport at DSF 1');
  }
  const decoded = await page.evaluate(async (base64) => {
    const binary = atob(base64);
    const png = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const image = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const dimensions = { width: image.width, height: image.height };
    image.close();
    return dimensions;
  }, bytes.toString('base64'));
  if (decoded.width !== fullPageDimensions.width || decoded.height !== fullPageDimensions.height) {
    throw new Error('P1.12 retained screenshot failed real Chromium image decode');
  }
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fullPageDimensions,
    imageDecode: {
      engine: 'chromium',
      result: 'pass',
      ...decoded,
    },
  };
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(signature) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new Error('P1.12 retained screenshot is not an openable PNG');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function resolveInside(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('P1.12 screenshot path escapes output root');
  }
  return resolved;
}
