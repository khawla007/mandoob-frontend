import type { Metadata } from 'next';
import { QuestionnaireForm } from '@/components/questionnaire/QuestionnaireForm';
import { normalizeEstimatorHandoff } from '@/lib/questionnaire';

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: 'Company Setup Application | Mandoob',
  description: 'Submit your UAE company setup questionnaire.',
};

export default async function ApplyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = toUrlSearchParams(await searchParams);
  const { answers, estimateData } = normalizeEstimatorHandoff(params);

  return <QuestionnaireForm initialAnswers={answers} estimateData={estimateData} />;
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
