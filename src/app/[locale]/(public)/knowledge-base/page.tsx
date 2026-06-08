import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getArticlesByCategory,
  knowledgeBaseArticles,
  type KnowledgeBaseArticle,
} from '@/lib/knowledge-base';

export const metadata: Metadata = {
  title: 'UAE Company Setup Knowledge Base | Mandoob',
  description:
    'Browse practical UAE company setup guides covering free zones, mainland licensing, documents, timelines, visas, costs, and compliance.',
  alternates: {
    canonical: '/knowledge-base',
  },
};

export default function KnowledgeBasePage() {
  const articles = knowledgeBaseArticles;
  const groupedArticles = getArticlesByCategory();
  const featured = articles.slice(0, 3);
  const faqHighlights = articles.flatMap((article) => article.faq).slice(0, 4);

  return (
    <div className="bg-muted/20">
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-16">
        <div>
          <Badge variant="secondary">Knowledge Base</Badge>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            UAE company setup guidance by topic, authority, and decision point
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-base">
            Compare setup paths, required documents, timelines, cost assumptions, and compliance
            steps before moving into an indicative estimate.
          </p>
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Start with an estimate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Use the public estimator after narrowing down a jurisdiction or authority.
            </p>
            <Button asChild className="w-full">
              <Link href="/estimate">Estimate setup cost</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 lg:grid-cols-3">
          {featured.map((article) => (
            <ArticleCard key={article.slug} article={article} featured />
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Categories
            </h2>
            <div className="flex flex-wrap gap-2 lg:block lg:space-y-2">
              {groupedArticles.map((group) => (
                <a
                  key={group.category.id}
                  href={`#${group.category.id}`}
                  className="inline-flex rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted lg:w-full"
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
                    <h2 className="text-2xl font-semibold tracking-tight">{group.category.label}</h2>
                    <p className="text-muted-foreground mt-1 text-sm">{group.category.description}</p>
                  </div>
                  <span className="text-muted-foreground text-sm">{group.articles.length} guides</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {group.articles.map((article) => (
                    <ArticleCard key={article.slug} article={article} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {faqHighlights.length > 0 ? (
          <section className="mt-12 rounded-lg border bg-background p-6">
            <h2 className="text-2xl font-semibold tracking-tight">Common setup questions</h2>
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

function ArticleCard({ article, featured = false }: { article: KnowledgeBaseArticle; featured?: boolean }) {
  const readingTime = `${article.readingTimeMinutes} min read`;

  return (
    <Card className={featured ? 'bg-background' : 'bg-card'}>
      <CardHeader>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{article.category}</Badge>
          <span className="text-muted-foreground text-xs">{readingTime}</span>
        </div>
        <CardTitle>
          <Link href={`/knowledge-base/${article.slug}`} className="hover:underline">
            {article.title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground leading-6">{article.description}</p>
        <p className="text-muted-foreground mt-4 text-xs">Updated {article.updatedAt}</p>
      </CardContent>
    </Card>
  );
}
