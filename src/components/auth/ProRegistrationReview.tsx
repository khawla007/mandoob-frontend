import Link from 'next/link';
import { BadgeCheck, Building2, CircleAlert, ClipboardCheck, ShieldCheck } from 'lucide-react';

import type { ProRegistrationState } from './pro-registration-state';
import styles from './pro-registration-review.module.css';

type StateCopy = { title: string; body: string };

export type ProRegistrationReviewLabels = {
  eyebrow: string;
  title: string;
  description: string;
  eligibilityTitle: string;
  eligibility: [string, string, string];
  policyTitle: string;
  policyNote: string;
  reviewNotApproval: string;
  processTitle: string;
  process: [string, string, string];
  submissionUnavailable: string;
  contactCta: string;
  contactHandoff: string;
  customerCta: string;
  presentationOnly: string;
  stateLabel: string;
  states: Record<ProRegistrationState, StateCopy>;
};

type ProRegistrationReviewProps = {
  labels: ProRegistrationReviewLabels;
  state: ProRegistrationState;
  presentationOnly: boolean;
};

export function ProRegistrationReview({
  labels,
  state,
  presentationOnly,
}: ProRegistrationReviewProps) {
  const stateRole = ['validation', 'rate', 'error'].includes(state) ? 'alert' : 'status';
  const stateCopy = labels.states[state];

  return (
    <>
      <header className="auth-card__head">
        <span className="eyebrow">{labels.eyebrow}</span>
        <h1>{labels.title}</h1>
        <p>{labels.description}</p>
      </header>

      <section
        className={styles.statePanel}
        data-state={state}
        role={stateRole}
        aria-label={labels.stateLabel}
      >
        <CircleAlert aria-hidden="true" />
        <div>
          <strong>{stateCopy.title}</strong>
          <p>{stateCopy.body}</p>
        </div>
      </section>
      {presentationOnly ? <p className={styles.presentation}>{labels.presentationOnly}</p> : null}

      <section className={styles.section} aria-labelledby="pro-eligibility-title">
        <div className={styles.sectionHeading}>
          <BadgeCheck aria-hidden="true" />
          <h2 id="pro-eligibility-title">{labels.eligibilityTitle}</h2>
        </div>
        <ul className={styles.checklist}>
          {labels.eligibility.map((item) => (
            <li key={item}>
              <ShieldCheck aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.policy} aria-labelledby="pro-policy-title">
        <Building2 aria-hidden="true" />
        <div>
          <h2 id="pro-policy-title">{labels.policyTitle}</h2>
          <p>{labels.policyNote}</p>
          <p>{labels.reviewNotApproval}</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="pro-process-title">
        <div className={styles.sectionHeading}>
          <ClipboardCheck aria-hidden="true" />
          <h2 id="pro-process-title">{labels.processTitle}</h2>
        </div>
        <ol className={styles.process}>
          {labels.process.map((item, index) => (
            <li key={item}>
              <span aria-hidden="true">{index + 1}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className={styles.actions}>
        <p>{labels.submissionUnavailable}</p>
        <p>{labels.contactHandoff}</p>
        <Link href="/contact?topic=pro-interest" className="btn btn--accent">
          {labels.contactCta}
        </Link>
        <Link href="/register" className={styles.customerLink}>
          {labels.customerCta}
        </Link>
      </div>
    </>
  );
}
