import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { QuestionnaireForm } from '@/components/questionnaire/QuestionnaireForm';
import { normalizeEstimatorHandoff } from '@/lib/questionnaire';

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'apply' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function ApplyPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rawParams = await searchParams;
  const urlParams = toUrlSearchParams(rawParams);
  const { answers, estimateData } = normalizeEstimatorHandoff(urlParams);

  return (
    <main className="bg-muted/20 min-h-screen">
      <QuestionnaireForm initialAnswers={answers} estimateData={estimateData} />
    </main>
  );
}

function toUrlSearchParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}
