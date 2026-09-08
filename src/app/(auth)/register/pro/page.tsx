import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  ProRegistrationReview,
  type ProRegistrationReviewLabels,
} from '@/components/auth/ProRegistrationReview';
import { resolveProRegistrationState } from '@/components/auth/pro-registration-state';
import { buildAuthMetadata } from '@/lib/public-metadata';

import styles from '@/components/auth/pro-registration-review.module.css';

type RegisterProPageProps = {
  searchParams: Promise<{ state?: string | string[] }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.metadata.proRegister');
  return buildAuthMetadata({
    title: t('title'),
    description: t('description'),
    canonical: '/register/pro',
  });
}

export default async function RegisterProPage({ searchParams }: RegisterProPageProps) {
  const t = await getTranslations('auth');
  const query = await searchParams;
  const resolved = resolveProRegistrationState(query.state, process.env.NODE_ENV);
  const stateLabels = Object.fromEntries(
    [
      'ready',
      'unavailable',
      'validation',
      'pending',
      'review',
      'duplicate',
      'rate',
      'error',
      'success',
    ].map((state) => [
      state,
      {
        title: t(`proReview.states.${state}.title` as Parameters<typeof t>[0]),
        body: t(`proReview.states.${state}.body` as Parameters<typeof t>[0]),
      },
    ]),
  ) as ProRegistrationReviewLabels['states'];
  const labels: ProRegistrationReviewLabels = {
    eyebrow: t('proReview.eyebrow'),
    title: t('proReview.title'),
    description: t('proReview.description'),
    eligibilityTitle: t('proReview.eligibilityTitle'),
    eligibility: [
      t('proReview.eligibility.verified'),
      t('proReview.eligibility.company'),
      t('proReview.eligibility.review'),
    ],
    policyTitle: t('proReview.policyTitle'),
    policyNote: t('proReview.policyNote'),
    reviewNotApproval: t('proReview.reviewNotApproval'),
    processTitle: t('proReview.processTitle'),
    process: [
      t('proReview.process.interest'),
      t('proReview.process.eligibility'),
      t('proReview.process.invitation'),
    ],
    submissionUnavailable: t('proReview.submissionUnavailable'),
    contactCta: t('proReview.contactCta'),
    contactHandoff: t('proReview.contactHandoff'),
    customerCta: t('proReview.customerCta'),
    presentationOnly: t('proReview.presentationOnly'),
    stateLabel: t('proReview.stateLabel'),
    states: stateLabels,
  };

  return (
    <div className={styles.page}>
      <ProRegistrationReview
        labels={labels}
        state={resolved.state}
        presentationOnly={resolved.presentationOnly}
      />
    </div>
  );
}
