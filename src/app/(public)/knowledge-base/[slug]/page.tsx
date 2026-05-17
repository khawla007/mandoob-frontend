import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildArticleJsonLd,
  buildFaqJsonLd,
  getArticleBySlug,
  getRelatedArticles,
  knowledgeBaseArticles,
  SITE_ORIGIN,
  type KnowledgeBaseArticle,
} from '@/lib/knowledge-base';

type Params = { slug: string };

type ArticleSection = {
  heading: string;
  body: string | string[];
};

export function generateStaticParams() {
  return knowledgeBaseArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    return {};
  }

  return {
    title: `${article.title} | Mandoob Knowledge Base`,
    description: article.description,
    keywords: article.keywords,
    alternates: {
      canonical: `/knowledge-base/${article.slug}`,
    },
    openGraph: {
      title: article.title,
      description: article.description,
      type: 'article',
      url: `/knowledge-base/${article.slug}`,
    },
  };
}

export default async function KnowledgeBaseArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) notFound();

  const relatedArticles = getRelatedArticles(article);
  const articleJsonLd = buildArticleJsonLd(article, SITE_ORIGIN);
  const faqJsonLd = article.faq.length ? buildFaqJsonLd(article.faq) : null;
  const estimateHref = buildEstimateHref(article);
  const readingTime = `${article.readingTimeMinutes} min read`;

  return (
    <article className="bg-muted/20">
      <JsonLd data={articleJsonLd} />
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}

      <header className="mx-auto max-w-4xl px-6 py-12 lg:py-16">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{article.category}</Badge>
          <span className="text-muted-foreground text-sm">{readingTime}</span>
          <span className="text-muted-foreground text-sm">Updated {article.updatedAt}</span>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">{article.title}</h1>
        <p className="text-muted-foreground mt-5 max-w-3xl text-lg leading-8">{article.description}</p>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {article.sections.map((section) => (
            <section key={section.heading} className="rounded-lg border bg-background p-6">
              <h2 className="text-2xl font-semibold tracking-tight">{section.heading}</h2>
              <SectionBody section={section} />
            </section>
          ))}

          {article.faq.length ? (
            <section className="rounded-lg border bg-background p-6">
              <h2 className="text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
              <div className="mt-5 divide-y">
                {article.faq.map((item) => (
                  <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                    <h3 className="font-medium">{item.question}</h3>
                    <p className="text-muted-foreground mt-2 leading-7">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Estimate your setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Turn this guidance into an indicative UAE company setup estimate.
              </p>
              <Button asChild className="w-full">
                <Link href={estimateHref}>{article.cta.label ?? 'Open estimator'}</Link>
              </Button>
            </CardContent>
          </Card>

          {relatedArticles.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Related guides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {relatedArticles.map((related) => (
                  <Link
                    key={related.slug}
                    href={`/knowledge-base/${related.slug}`}
                    className="block rounded-lg border p-3 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{related.title}</span>
                    <span className="text-muted-foreground mt-1 block">{related.description}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function SectionBody({ section }: { section: ArticleSection }) {
  const paragraphs = Array.isArray(section.body) ? section.body : section.body ? [section.body] : [];

  return (
    <div className="mt-4 space-y-4">
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-muted-foreground leading-7">
          {paragraph}
        </p>
      ))}
    </div>
  );
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

function buildEstimateHref(article: KnowledgeBaseArticle) {
  const context = article.cta;
  const params = new URLSearchParams();
  if (context?.jurisdiction) params.set('jurisdiction', context.jurisdiction);
  if (context?.authority) params.set('authority', context.authority);
  if (context?.emirate) params.set('emirate', context.emirate);
  const query = params.toString();
  return query ? `/estimate?${query}` : '/estimate';
}
