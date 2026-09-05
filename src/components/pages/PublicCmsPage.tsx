import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

import type { CmsPage } from '@/lib/data/pages';
import { sanitizeBlogHtml } from '@/lib/blog/render';
import { pageHeroSettingsSchema } from '@/lib/validation/pages';
import { RESERVED_PAGE_SLUGS } from '@/lib/pages/slug';
import { isCmsPagePublic } from '@/lib/pages/visibility';
import { headingAnchor, shouldShowTableOfContents } from '@/lib/public-content/headings';
import { serializeJsonLd } from '@/lib/public-content/json-ld';

const ALIGN_TEXT = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;
const ALIGN_FLEX = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
} as const;

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

export type PublicCmsPageView = {
  bodyHtml: string;
  bodyHeadings: Array<{ id: string; label: string }>;
  hero: PublicHero | null;
};
type CmsPageLoader = (slug: string) => Promise<CmsPage | null>;

export async function resolvePublicCmsPage(
  slug: string,
  load: CmsPageLoader,
  now: Date = new Date(),
): Promise<CmsPage | null> {
  if (RESERVED_PAGE_SLUGS.has(slug.toLowerCase())) return null;
  const page = await load(slug);
  return page && isCmsPagePublic(page, now) ? page : null;
}

function excerpt(html: string): string | undefined {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  return serializeJsonLd(schema);
}

function clean(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function cssUrl(url: string): string {
  return `url(${JSON.stringify(url)})`;
}

export function getPublicCmsPageView(page: CmsPage): PublicCmsPageView {
  const sanitizedBody = sanitizeBlogHtml(page.contentHtml)
    .replace(/<h1(\s|>)/gi, '<h2$1')
    .replace(/<\/h1>/gi, '</h2>');
  const { html: bodyHtml, headings: bodyHeadings } = addBodyHeadingAnchors(sanitizedBody);
  const parsed = pageHeroSettingsSchema.safeParse(page.heroSettings);
  if (!parsed.success) return { bodyHtml, bodyHeadings, hero: null };

  const settings = parsed.data;
  const heading = clean(settings.heading);
  const text = clean(settings.text);
  const buttonLabel = clean(settings.buttonLabel);
  const buttonHref = clean(settings.buttonHref);
  const safeButtonHref = buttonHref && isSafePublicHref(buttonHref) ? buttonHref : null;
  const button =
    buttonLabel && safeButtonHref
      ? { href: safeButtonHref, label: buttonLabel, external: /^https:\/\//i.test(safeButtonHref) }
      : null;
  if (!heading && !text && !button) return { bodyHtml, bodyHeadings, hero: null };

  const backgroundImage =
    settings.backgroundImageUrl && isSecureExternalUrl(settings.backgroundImageUrl)
      ? cssUrl(settings.backgroundImageUrl)
      : undefined;
  return {
    bodyHtml,
    bodyHeadings,
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

export function PublicCmsPage({ page, kind = 'page' }: { page: CmsPage; kind?: 'page' | 'legal' }) {
  const view = getPublicCmsPageView(page);
  return (
    <article className="cms-editorial-page">
      {view.hero ? (
        <header className="cms-editorial-hero" style={view.hero.sectionStyle}>
          <div
            aria-hidden="true"
            className="cms-editorial-hero__overlay"
            style={view.hero.overlayStyle}
          />
          <div className="cms-editorial-hero__content container" style={view.hero.contentStyle}>
            <CmsBreadcrumb kind={kind} title={page.title} />
            <span className="eyebrow">{kind === 'legal' ? 'Legal' : 'Information'}</span>
            <h1 className={`display ${view.hero.headingClassName}`}>{view.hero.heading}</h1>
            {view.hero.text ? (
              <p className={`lede ${view.hero.textClassName}`}>{view.hero.text}</p>
            ) : null}
            {view.hero.button ? (
              <div className={`cms-editorial-hero__action ${view.hero.buttonClassName}`}>
                <a
                  className="btn btn--accent"
                  href={view.hero.button.href}
                  {...(view.hero.button.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {view.hero.button.label}
                </a>
              </div>
            ) : null}
          </div>
        </header>
      ) : (
        <header className="section cms-page__title-section kb-editorial-hero">
          <div className="container">
            <CmsBreadcrumb kind={kind} title={page.title} />
            <span className="eyebrow">{kind === 'legal' ? 'Legal' : 'Information'}</span>
            <h1 className="display">{page.title}</h1>
          </div>
        </header>
      )}
      <section className="section" aria-label={`${page.title} content`}>
        <div className="container">
          <div className="cms-editorial-layout">
            <div
              className="prose-doc kb-prose"
              dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
            />
            {shouldShowTableOfContents(view.bodyHeadings.map((heading) => heading.label)) ? (
              <aside className="cms-editorial-toc" aria-label="On this page" role="region">
                <h2>On this page</h2>
                <ol>
                  {view.bodyHeadings.map((heading) => (
                    <li key={heading.id}>
                      <a href={`#${heading.id}`}>{heading.label}</a>
                    </li>
                  ))}
                </ol>
              </aside>
            ) : null}
          </div>
        </div>
      </section>
    </article>
  );
}

function addBodyHeadingAnchors(html: string) {
  const headings: Array<{ id: string; label: string }> = [];
  const seen = new Map<string, number>();
  const anchored = html.replace(/<h2(?:\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (_match, content: string) => {
    const label = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label) return `<h2>${content}</h2>`;
    const base = headingAnchor(label);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    headings.push({ id, label });
    return `<h2 id="${id}">${content}</h2>`;
  });
  return { html: anchored, headings };
}

function isSecureExternalUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSafePublicHref(value: string) {
  return (value.startsWith('/') && !value.startsWith('//')) || isSecureExternalUrl(value);
}

function CmsBreadcrumb({ kind, title }: { kind: 'page' | 'legal'; title: string }) {
  return (
    <nav className="kb-editorial-breadcrumb" aria-label="Breadcrumb">
      {/* A native anchor keeps this server-only CMS renderer testable without a router context. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/">Home</a>
      <span aria-hidden="true">/</span>
      {kind === 'legal' ? (
        <>
          <span>Legal</span>
          <span aria-hidden="true">/</span>
        </>
      ) : null}
      <span aria-current="page">{title}</span>
    </nav>
  );
}
