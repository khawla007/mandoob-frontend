import type { Metadata } from 'next';
import { QuestionnaireForm } from '@/components/questionnaire/QuestionnaireForm';
import {
  APPLICATION_DEFINITION,
  parseEstimatorApplicationHandoff,
  type DemoApplicationOutcome,
} from '@/lib/public-application';
import { buildAuthMetadata } from '@/lib/public-metadata';

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = buildAuthMetadata({
  title: 'Company Setup Application | Mandoob',
  description: 'Prepare your UAE company setup application in a private local preview.',
  canonical: '/apply',
});

export default async function ApplyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = toUrlSearchParams(await searchParams);
  const handoff = parseEstimatorApplicationHandoff(params, APPLICATION_DEFINITION);
  const demoOutcome = serverDemoOutcome();

  return <QuestionnaireForm handoff={handoff} demoOutcome={demoOutcome} />;
}

function serverDemoOutcome(): DemoApplicationOutcome | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const value = process.env.MANDOOB_P109_DEMO_OUTCOME;
  return ['confirmed-preview', 'duplicate', 'rate-limited', 'unavailable', 'error'].includes(
    value ?? '',
  )
    ? (value as DemoApplicationOutcome)
    : null;
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
