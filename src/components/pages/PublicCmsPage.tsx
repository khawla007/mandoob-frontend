import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import type { CmsPage } from '@/lib/data/pages';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { pageHeroSettingsSchema } from '@/lib/validation/pages';
import { RESERVED_PAGE_SLUGS } from '@/lib/pages/slug';
import { isCmsPagePublic } from '@/lib/pages/visibility';

const ALIGN_TEXT = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const ALIGN_FLEX = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;

type PublicHero = {
  heading: string;
  text: string | null;
  headingClassName: string;
  textClassName: string;
  buttonClassName: string;
  button: { href: string; label: string; external: boolean } | null;
  backgroundImage: string | undefined;
  sectionStyle: CSSProperties;
  contentStyle: CSSProperties;
  overlayStyle: CSSProperties;
};

export type PublicCmsPageView = { bodyHtml: string; hero: PublicHero | null };
type CmsPageLoader = (slug: string) => Promise<CmsPage | null>;

export async function resolvePublicCmsPage(slug: string, load: CmsPageLoader, now: Date = new Date()): Promise<CmsPage | null> {
  if (RESERVED_PAGE_SLUGS.has(slug.toLowerCase())) return null;
  const page = await load(slug);
  return page && isCmsPagePublic(page, now) ? page : null;
}

function excerpt(html: string): string | undefined {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 170) : undefined;
}

export function buildCmsPageMetadata(page: CmsPage | null): Metadata {
  if (!page) return {};
  const description = page.metaDescription ?? excerpt(page.contentHtml);
  return {
    title: page.metaTitle ?? page.title,
    ...(description ? { description } : {}),
    ...(page.canonicalUrl ? { alternates: { canonical: page.canonicalUrl } } : {}),
    robots: { index: !page.noindex, follow: !page.noindex },
  };
}

export function serializeSchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}

function clean(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

export function getPublicCmsPageView(page: CmsPage): PublicCmsPageView {
  const bodyHtml = sanitizeBlogHtml(page.contentHtml)
    .replace(/<h1(\s|>)/gi, '<h2$1')
    .replace(/<\/h1>/gi, '</h2>');
  const parsed = pageHeroSettingsSchema.safeParse(page.heroSettings);
  if (!parsed.success) return { bodyHtml, hero: null };

  const settings = parsed.data;
  const heading = clean(settings.heading);
  const text = clean(settings.text);
  const buttonLabel = clean(settings.buttonLabel);
  const buttonHref = clean(settings.buttonHref);
  const button = buttonLabel && buttonHref
    ? { href: buttonHref, label: buttonLabel, external: /^https?:\/\//i.test(buttonHref) }
    : null;
  if (!heading && !text && !button) return { bodyHtml, hero: null };

  const backgroundImage = settings.backgroundImageUrl ? cssUrl(settings.backgroundImageUrl) : undefined;
  return {
    bodyHtml,
    hero: {
      heading: heading ?? page.title,
      text,
      button,
      backgroundImage,
      headingClassName: ALIGN_TEXT[settings.headingAlignment],
      textClassName: ALIGN_TEXT[settings.textAlignment],
      buttonClassName: ALIGN_FLEX[settings.buttonAlignment],
      sectionStyle: {
        backgroundColor: settings.backgroundColor,
        backgroundImage,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
        minHeight: settings.minHeight,
        margin: settings.margin,
      },
      contentStyle: { maxWidth: settings.maxWidth, padding: settings.padding },
      overlayStyle: { backgroundColor: settings.overlayColor, opacity: settings.overlayOpacity },
    },
  };
}

export function PublicCmsPage({ page }: { page: CmsPage }) {
  const view = getPublicCmsPageView(page);
  return (
    <article>
      {view.hero ? (
        <header className="relative flex items-center overflow-hidden" style={view.hero.sectionStyle}>
          <div aria-hidden="true" className="absolute inset-0" style={view.hero.overlayStyle} />
          <div className="container relative z-10 w-full py-16 sm:py-24" style={view.hero.contentStyle}>
            <h1 className={`h2 ${view.hero.headingClassName}`}>{view.hero.heading}</h1>
            {view.hero.text ? <p className={`mt-5 text-lg ${view.hero.textClassName}`}>{view.hero.text}</p> : null}
            {view.hero.button ? (
              <div className={`mt-8 flex ${view.hero.buttonClassName}`}>
                <a
                  className="btn btn--accent"
                  href={view.hero.button.href}
                  {...(view.hero.button.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {view.hero.button.label}
                </a>
              </div>
            ) : null}
          </div>
        </header>
      ) : (
        <header className="section cms-page__title-section">
          <div className="container"><h1 className="h2">{page.title}</h1></div>
        </header>
      )}
      <section className="section" aria-label={`${page.title} content`}>
        <div className="container">
          <div className="prose-doc" dangerouslySetInnerHTML={{ __html: view.bodyHtml }} />
        </div>
      </section>
    </article>
  );
}
