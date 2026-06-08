import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  authoritySetupPages,
  buildFaqJsonLd,
  getAuthorityPageBySlug,
  type AuthorityPageData,
} from '@/lib/knowledge-base';

type Params = { locale: string; authoritySlug: string };

export function generateStaticParams() {
  return authoritySetupPages.map((page) => ({ authoritySlug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { locale, authoritySlug } = await params;
  const page = getAuthorityPageBySlug(authoritySlug);

  if (!page) return {};

  const t = await getTranslations({ locale, namespace: 'company-setup' });

  return {
    title: t('metaTitle', { authority: page.authority }),
    description: page.description,
    keywords: page.keywords,
    alternates: {
      canonical: `/company-setup/${page.slug}`,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `/company-setup/${page.slug}`,
      type: 'article',
    },
  };
}

export default async function AuthoritySetupPage({ params }: { params: Promise<Params> }) {
  const { locale, authoritySlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'company-setup' });

  const page = getAuthorityPageBySlug(authoritySlug);
  if (!page) notFound();

  const faq = buildAuthorityFaq(page, t);
  const faqJsonLd = buildFaqJsonLd(faq);

  const jurisdictionBadge = jurisdictionLabel(page.jurisdiction, t);
  const estimateHref = relativeEstimateHref(page.handoffUrl);

  return (
    <article className="bg-muted/20">
      <JsonLd data={faqJsonLd} />
      <header className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{jurisdictionBadge}</Badge>
          {page.emirate ? <Badge variant="outline">{emirateLabel(page.emirate)}</Badge> : null}
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">{page.title}</h1>
        <p className="text-muted-foreground mt-5 max-w-3xl text-lg leading-8">{page.description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={estimateHref}>{t('estimateCta', { authority: page.authority })}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/knowledge-base">{t('browseKnowledgeBase')}</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('costPositioningTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-7">{page.setupCostPositioning}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('timelineTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-7">
                {t.rich('timelineBody', {
                  authority: page.authority,
                  min: page.timelineDays.min,
                  max: page.timelineDays.max,
                  strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('documentsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {page.requiredDocumentKeys.map((key) => (
                  <li key={key} className="bg-background rounded-md border px-3 py-2 text-sm">
                    {(t.raw('documentLabels') as Record<string, string>)[key] ??
                      key.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('faqTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {faq.map((item) => (
                <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                  <h2 className="font-medium">{item.question}</h2>
                  <p className="text-muted-foreground mt-2 leading-7">{item.answer}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{t('planSetupTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                {t('planSetupBody', { authority: page.authority })}
              </p>
              <Button asChild className="w-full">
                <Link href={estimateHref}>{t('openEstimator')}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('assumptionsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-muted-foreground space-y-3 text-sm">
                {page.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

type TranslateFn = Awaited<ReturnType<typeof getTranslations<'company-setup'>>>;

function buildAuthorityFaq(page: AuthorityPageData, t: TranslateFn) {
  return [
    {
      question: t('faq.costQuestion', { authority: page.authority }),
      answer: t('faq.costAnswer', { positioning: page.setupCostPositioning }),
    },
    {
      question: t('faq.timelineQuestion', { authority: page.authority }),
      answer: t('faq.timelineAnswer', {
        authority: page.authority,
        min: page.timelineDays.min,
        max: page.timelineDays.max,
      }),
    },
    {
      question: t('faq.officialQuestion', { authority: page.authority }),
      answer: t('faq.officialAnswer'),
    },
  ];
}

function relativeEstimateHref(handoffUrl: string): string {
  const url = new URL(handoffUrl);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function jurisdictionLabel(
  jurisdiction: AuthorityPageData['jurisdiction'],
  t: TranslateFn,
): string {
  if (jurisdiction === 'free_zone') return t('jurisdictions.freeZone');
  if (jurisdiction === 'mainland') return t('jurisdictions.mainland');
  return t('jurisdictions.offshore');
}

function emirateLabel(emirate: string): string {
  return emirate
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
