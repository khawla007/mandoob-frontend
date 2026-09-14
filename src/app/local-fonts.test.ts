import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const fontsDirectory = join(root, 'src/app/fonts');
const layout = readFileSync(join(root, 'src/app/layout.tsx'), 'utf8');
const provenance = readFileSync(join(fontsDirectory, 'README.md'), 'utf8');

const fontLedger = [
  {
    file: 'Geist-Variable.ttf',
    variable: '--font-geist-sans',
    sha256: '73894e0448cae90a92b6c2f8732b7bb9acb7b94c418bff559dad4a18e1de9659',
    url: 'https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/Geist/variable/Geist%5Bwght%5D.ttf',
  },
  {
    file: 'GeistMono-Variable.ttf',
    variable: '--font-geist-mono',
    sha256: '87c2aff9723544a9adaea19d92e42a33705c9723624801b6e0224c2206a6af0d',
    url: 'https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/fonts/GeistMono/variable/GeistMono%5Bwght%5D.ttf',
  },
  {
    file: 'NotoKufiArabic-Variable.ttf',
    variable: '--font-arabic',
    sha256: '494f6b61469d7a02a2d63f0fc4930bb007388d8cfe551de5eb98354e100889f3',
    url: 'https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf',
  },
] as const;

const licenseLedger = [
  {
    file: 'Geist-OFL-1.1.txt',
    copyright: 'Copyright 2024 The Geist Project Authors',
    sha256: '942560b236adfa83745b2c64e5fc09ebaf91cb331751b1157eb92187e5d6e930',
    url: 'https://github.com/vercel/geist-font/blob/10dc7658f13c38a474cde201bb09a4617267545b/OFL.txt',
  },
  {
    file: 'NotoKufiArabic-OFL-1.1.txt',
    copyright: 'Copyright 2022 The Noto Project Authors',
    sha256: 'df5143cdf3380169f2d03bf6d2cd243e85621fd097e608c3607cf7f9c9884ae6',
    url: 'https://github.com/google/fonts/blob/0cf764bb712367b6079cbb4fd2353e6f54ec6850/ofl/notokufiarabic/OFL.txt',
  },
] as const;

function sha256(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readBuildSources(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'local-fonts.test.ts')
    .map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return readBuildSources(path);
      return /\.(?:css|ts|tsx)$/u.test(entry.name) ? readFileSync(path, 'utf8') : '';
    })
    .join('\n');
}

test('root layout uses only vendored local fonts while preserving variables and weight coverage', () => {
  const buildSources = readBuildSources(join(root, 'src'));
  assert.doesNotMatch(buildSources, /next\/font\/google/u);
  assert.doesNotMatch(buildSources, /fonts\.(?:googleapis|gstatic)\.com/u);
  assert.match(layout, /import localFont from 'next\/font\/local'/u);

  for (const { file, variable } of fontLedger) {
    assert.match(
      layout,
      new RegExp(
        `src:\\s*'\\./fonts/${file.replace('.', '\\.')}[\\s\\S]{0,100}variable:\\s*'${variable}'[\\s\\S]{0,100}weight:\\s*'100 900'[\\s\\S]{0,100}style:\\s*'normal'`,
        'u',
      ),
    );
  }
});

test('every font binary matches the immutable official-source ledger', () => {
  const actualFonts = readdirSync(fontsDirectory)
    .filter((file) => /\.(?:ttf|otf|woff2?)$/u.test(file))
    .sort();
  assert.deepEqual(actualFonts, fontLedger.map(({ file }) => file).sort());

  for (const { file, sha256: expectedHash, url } of fontLedger) {
    const path = join(fontsDirectory, file);
    assert.ok(statSync(path).size > 0, `${file} must not be empty`);
    assert.equal(sha256(path), expectedHash, `${file} must match its immutable source`);
    assert.ok(provenance.includes(url), `${file} immutable source URL must be documented`);
    assert.ok(provenance.includes(expectedHash), `${file} hash must be documented`);
  }
});

test('each upstream OFL file is intact and documented', () => {
  for (const { file, copyright, sha256: expectedHash, url } of licenseLedger) {
    const path = join(fontsDirectory, file);
    const license = readFileSync(path, 'utf8');
    assert.ok(statSync(path).size > 0, `${file} must not be empty`);
    assert.equal(sha256(path), expectedHash, `${file} must match its immutable source`);
    assert.match(license, new RegExp(copyright, 'u'));
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/u);
    assert.ok(provenance.includes(url), `${file} immutable source URL must be documented`);
    assert.ok(provenance.includes(expectedHash), `${file} hash must be documented`);
  }
});
