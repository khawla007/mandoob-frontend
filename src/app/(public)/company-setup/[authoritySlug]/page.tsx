import type { Metadata } from 'next';
import Link from 'next/link';
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

type Params = { authoritySlug: string };

const DOCUMENT_LABELS: Record<string, string> = {
  attested_documents: 'Attested corporate documents',
  business_plan: 'Business plan or activity summary',
  lease_agreement: 'Lease or flexi desk confirmation',
  medical_fitness: 'Medical fitness and Emirates ID documents',
  passport: 'Passport copy',
  photo: 'Passport photo',
  shareholder_resolution: 'Shareholder resolution',
  trade_license: 'Trade license copy',
};

export function generateStaticParams() {
  return authoritySetupPages.map((page) => ({ authoritySlug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { authoritySlug } = await params;
  const page = getAuthorityPageBySlug(authoritySlug);

  if (!page) return {};

  return {
    title: `${page.authority} Company Setup Cost Guide | Mandoob`,
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
  const { authoritySlug } = await params;
  const page = getAuthorityPageBySlug(authoritySlug);

  if (!page) notFound();

  const faq = buildAuthorityFaq(page);
  const faqJsonLd = buildFaqJsonLd(faq);

  return (
    <article className="bg-muted/20">
      <JsonLd data={faqJsonLd} />
      <header className="mx-auto max-w-5xl px-6 py-12 lg:py-16">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{jurisdictionLabel(page.jurisdiction)}</Badge>
          {page.emirate ? <Badge variant="outline">{emirateLabel(page.emirate)}</Badge> : null}
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">{page.title}</h1>
        <p className="text-muted-foreground mt-5 max-w-3xl text-lg leading-8">{page.description}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={relativeEstimateHref(page.handoffUrl)}>Estimate {page.authority} setup</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/knowledge-base">Browse Knowledge Base</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 pb-16 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Indicative setup cost positioning</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-7">{page.setupCostPositioning}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expected timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-7">
                A straightforward {page.authority} setup is currently modeled at{' '}
                <strong className="text-foreground">
                  {page.timelineDays.min}-{page.timelineDays.max} days
                </strong>{' '}
                before add-on services, immigration steps, or authority-specific approvals.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Common document checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {page.requiredDocumentKeys.map((key) => (
                  <li key={key} className="rounded-md border bg-background px-3 py-2 text-sm">
                    {DOCUMENT_LABELS[key] ?? key.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frequently asked questions</CardTitle>
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
              <CardTitle>Plan this setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Open the estimator with {page.authority} preselected and adjust visas,
                shareholders, office type, and add-ons.
              </p>
              <Button asChild className="w-full">
                <Link href={relativeEstimateHref(page.handoffUrl)}>Open estimator</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assumptions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-muted-foreground">
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

function buildAuthorityFaq(page: AuthorityPageData) {
  return [
    {
      question: `How much does ${page.authority} company setup cost?`,
      answer: `${page.setupCostPositioning} Use the estimator to model visas, shareholders, office type, and add-ons.`,
    },
    {
      question: `How long does ${page.authority} setup take?`,
      answer: `The current public model estimates ${page.timelineDays.min}-${page.timelineDays.max} days for core setup components before special approvals or post-license services.`,
    },
    {
      question: `Is this ${page.authority} fee data official?`,
      answer:
        'No. Mandoob public pages use estimate-grade planning data. Final authority pricing must be confirmed before submission or payment.',
    },
  ];
}

function relativeEstimateHref(handoffUrl: string): string {
  const url = new URL(handoffUrl);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

function jurisdictionLabel(jurisdiction: AuthorityPageData['jurisdiction']): string {
  if (jurisdiction === 'free_zone') return 'Free Zone';
  if (jurisdiction === 'mainland') return 'Mainland';
  return 'Offshore';
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
