import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getArticlesByCategory,
  knowledgeBaseArticles,
  type KnowledgeBaseArticle,
} from '@/lib/knowledge-base';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'knowledge-base' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: '/knowledge-base',
    },
  };
}

export default async function KnowledgeBasePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'knowledge-base' });

  const articles = knowledgeBaseArticles;
  const groupedArticles = getArticlesByCategory();
  const featured = articles.slice(0, 3);
  const faqHighlights = articles.flatMap((article) => article.faq).slice(0, 4);

  return (
    <div className="bg-muted/20">
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-16">
        <div>
          <Badge variant="secondary">{t('badge')}</Badge>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            {t('pageTitle')}
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base">{t('pageSubtitle')}</p>
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t('estimateCardTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{t('estimateCardBody')}</p>
            <Button asChild className="w-full">
              <Link href="/estimate">{t('estimateButton')}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 lg:grid-cols-3">
          {featured.map((article) => (
            <ArticleCard
              key={article.slug}
              article={article}
              featured
              readingTimeStr={t('readingTime', { minutes: article.readingTimeMinutes })}
              updatedAtStr={t('updatedAt', { date: article.updatedAt })}
            />
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {t('categoriesHeading')}
            </h2>
            <div className="flex flex-wrap gap-2 lg:block lg:space-y-2">
              {groupedArticles.map((group) => (
                <a
                  key={group.category.id}
                  href={`#${group.category.id}`}
                  className="bg-background hover:bg-muted inline-flex rounded-lg border px-3 py-2 text-sm lg:w-full"
                >
                  {group.category.label}
                </a>
              ))}
            </div>
          </aside>

          <div className="space-y-8">
            {groupedArticles.map((group) => (
              <section key={group.category.id} id={group.category.id} className="scroll-mt-24">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {group.category.label}
                    </h2>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {group.category.description}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {t('guidesCount', { count: group.articles.length })}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.articles.map((article) => (
                    <ArticleCard
                      key={article.slug}
                      article={article}
                      readingTimeStr={t('readingTime', { minutes: article.readingTimeMinutes })}
                      updatedAtStr={t('updatedAt', { date: article.updatedAt })}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {faqHighlights.length > 0 ? (
          <section className="bg-background mt-12 rounded-lg border p-6">
            <h2 className="text-2xl font-semibold tracking-tight">{t('faqSectionTitle')}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {faqHighlights.map((item) => (
                <div key={item.question}>
                  <h3 className="font-medium">{item.question}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function ArticleCard({
  article,
  featured = false,
  readingTimeStr,
  updatedAtStr,
}: {
  article: KnowledgeBaseArticle;
  featured?: boolean;
  readingTimeStr: string;
  updatedAtStr: string;
}) {
  return (
    <Card className={featured ? 'bg-background' : 'bg-card'}>
      <CardHeader>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{article.category}</Badge>
          <span className="text-muted-foreground text-xs">{readingTimeStr}</span>
        </div>
        <CardTitle>
          <Link href={`/knowledge-base/${article.slug}`} className="hover:underline">
            {article.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-6">{article.description}</p>
        <p className="text-muted-foreground mt-4 text-xs">{updatedAtStr}</p>
      </CardContent>
    </Card>
  );
}
