import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';

const headerSource = readFileSync(new URL('./SiteHeader.tsx', import.meta.url), 'utf8');

type Messages = Record<string, unknown>;

const SHELL_COPY_PATHS = [
  'brandHome',
  'skipToMain',
  'primaryNav',
  'mobileNav',
  'menuTitle',
  'openMenu',
  'closeMenu',
  'platform',
  'estimate',
  'customers',
  'forPros',
  'pricing',
  'getEstimate',
  'openWorkspace',
  'themeUseLight',
  'themeUseDark',
  'languageChanging',
  'languageChangeFailed',
  'footer.product',
  'footer.company',
  'footer.legal',
  'footer.description',
  'footer.location',
  'footer.identity',
  'footer.estimator',
  'footer.startApplication',
  'footer.forPros',
  'footer.pricing',
  'footer.about',
  'footer.knowledgeBase',
  'footer.contact',
  'footer.howItWorks',
  'footer.privacy',
  'footer.terms',
  'footer.pdpl',
  'footer.trustCenter',
] as const;

function valueAt(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return (value as Messages)[key];
  }, root);
}

function icuVariables(value: string): string[] {
  const variables = new Set<string>();

  function visit(elements: MessageFormatElement[]) {
    for (const element of elements) {
      if (
        element.type === TYPE.argument ||
        element.type === TYPE.number ||
        element.type === TYPE.date ||
        element.type === TYPE.time ||
        element.type === TYPE.select ||
        element.type === TYPE.plural
      ) {
        variables.add(element.value);
      }
      if (element.type === TYPE.select || element.type === TYPE.plural) {
        for (const option of Object.values(element.options)) visit(option.value);
      } else if (element.type === TYPE.tag) {
        visit(element.children);
      }
    }
  }

  visit(parse(value));
  return [...variables].sort();
}

describe('public shell copy contract', () => {
  it('defines every Step 1.2 shell key with exact EN/AR ICU parity', () => {
    for (const path of SHELL_COPY_PATHS) {
      const englishValue = valueAt(en.site, path);
      const arabicValue = valueAt(ar.site, path);
      assert.equal(typeof englishValue, 'string', `Missing en.site.${path}`);
      assert.equal(typeof arabicValue, 'string', `Missing ar.site.${path}`);
      assert.match(
        arabicValue as string,
        /[\u0600-\u06ff]/u,
        `Arabic copy is not meaningful at site.${path}`,
      );
      assert.deepEqual(
        icuVariables(arabicValue as string),
        icuVariables(englishValue as string),
        `ICU variables differ at site.${path}`,
      );
    }
  });

  it('uses the approved neutral English and reviewed Arabic identity', () => {
    assert.equal(en.site.footer.identity, 'Mandoob by Fanatic Coders · Dubai, UAE');
    assert.equal(ar.site.footer.identity, 'مندوب من فاناتك كودرز · دبي، الإمارات العربية المتحدة');
  });

  it('keeps new footer identity fields free of unsupported claims', () => {
    const unsupportedClaims = [
      /\b(?:licen[cs]e|permit)\b|رخصة|ترخيص/iu,
      /\b(?:ISO|SOC\s*2|certified|accredited)\b|شهادة|حاصل على اعتماد/iu,
      /\b(?:government[ -](?:approved|endorsed)|official government partner)\b|معتمد من الحكومة|شريك حكومي رسمي/iu,
      /\b(?:cheapest|guaranteed price|fixed price)\b|الأرخص|سعر مضمون|سعر ثابت/iu,
      /\b(?:instant|same[ -]day|guaranteed time|within 24 hours)\b|فوري|في اليوم نفسه|وقت مضمون|خلال (?:24|٢٤) ساعة/iu,
    ];

    for (const [locale, messages] of [
      ['en', en],
      ['ar', ar],
    ] as const) {
      for (const path of ['footer.description', 'footer.location', 'footer.identity']) {
        const value = valueAt(messages.site, path);
        assert.equal(typeof value, 'string', `Missing ${locale}.site.${path}`);
        for (const claim of unsupportedClaims) {
          assert.doesNotMatch(
            value as string,
            claim,
            `${locale}.site.${path} has an unsupported claim`,
          );
        }
      }
    }
  });
});

describe('public-facing layout copy', () => {
  for (const layout of ['../../app/(public)/layout.tsx', '../../app/(auth)/layout.tsx']) {
    const source = readFileSync(new URL(layout, import.meta.url), 'utf8');

    it(`${layout} resolves its single skip link on the server`, () => {
      assert.match(source, /import \{ getTranslations \} from 'next-intl\/server';/u);
      assert.match(source, /export default async function \w+Layout/u);
      assert.match(source, /await getTranslations\('site'\)/u);
      assert.match(source, /\{t\('skipToMain'\)\}/u);
      assert.equal(source.match(/className="skip-link"/gu)?.length, 1);
      assert.equal(source.match(/<main\b/gu)?.length, 1);
    });
  }
});

describe('SiteHeader localization contract', () => {
  it('localizes the brand, navigation, CTA, and mobile action copy through site messages', () => {
    assert.match(headerSource, /aria-label=\{tSite\('brandHome'\)\}/u);
    for (const key of [
      'primaryNav',
      'mobileNav',
      'menuTitle',
      'openMenu',
      'closeMenu',
      'getEstimate',
      'openWorkspace',
      'languageChanging',
      'languageChangeFailed',
    ]) {
      assert.match(headerSource, new RegExp(`tSite\\('${key}'\\)`, 'u'));
    }
    assert.doesNotMatch(headerSource, />\s*(?:Platform|Customers|For PROs|Get Started)\s*</u);
  });

  it('passes safe localized language pending and failure copy across both switchers', () => {
    assert.match(
      headerSource,
      /<LanguageSwitcher[^>]*failureMessage=\{tSite\('languageChangeFailed'\)\}[^>]*pendingLabel=\{tSite\('languageChanging'\)\}/u,
    );
    assert.match(
      headerSource,
      /<MobileNav[^>]*languageFailureMessage=\{tSite\('languageChangeFailed'\)\}[^>]*languagePendingLabel=\{tSite\('languageChanging'\)\}/u,
    );
  });
});
