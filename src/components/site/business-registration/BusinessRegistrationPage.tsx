import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Briefcase,
  Calculator,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  Rocket,
  Store,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { InfoCardGrid, InfoPageHero, InfoSection } from '../resources/InfoPage';

/**
 * `/business-registration` — merges two pages from the updated design HTML
 * (`docs/updated design mandoopp/Whole HTML`): `renderBusinessSetup` content
 * first (hero + three jurisdiction cards), then `renderRegistrationProcess`
 * (six guided steps + Start Registration), then the "Next Steps" cards.
 */

type SetupType = {
  id: 'mainland' | 'free-zone' | 'offshore';
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

const setupTypes: readonly SetupType[] = [
  {
    id: 'mainland',
    title: 'Mainland',
    description: 'Trade anywhere in the UAE and bid for government contracts.',
    href: '/mainland',
    icon: Landmark,
  },
  {
    id: 'free-zone',
    title: 'Free Zone',
    description: '100% ownership, tax benefits and simplified incorporation.',
    href: '/free-zones',
    icon: Store,
  },
  {
    id: 'offshore',
    title: 'Offshore',
    description: 'International business, confidentiality and asset protection.',
    href: '/offshore',
    icon: Globe2,
  },
];

const registrationSteps = [
  { icon: <UserRound />, title: '1. Contact Details', text: 'Tell us how to reach you.' },
  {
    icon: <Briefcase />,
    title: '2. Business Details',
    text: 'Activity, company names and business plan.',
  },
  {
    icon: <Globe2 />,
    title: '3. Setup Preferences',
    text: 'Jurisdiction, visas, office and services.',
  },
  {
    icon: <UsersRound />,
    title: '4. Ownership',
    text: 'Shareholder details and ownership split.',
  },
  {
    icon: <FileCheck2 />,
    title: '5. Review & Documents',
    text: 'Check everything and upload files.',
  },
  { icon: <Rocket />, title: '6. Submit', text: 'Track your application in the dashboard.' },
];

// "Start Registration" lives once, under the guided steps, so Next Steps keeps two cards.
const nextSteps = [
  {
    icon: <Calculator />,
    title: 'Calculate Cost',
    text: 'Model licence, office, visa and PRO fees.',
    href: '/estimate',
    cta: 'Open Estimator',
  },
  {
    icon: <FileText />,
    title: 'Review Documents',
    text: 'See the standard checklist before you apply.',
    href: '/document-requirements',
    cta: 'Requirements',
  },
];

export function BusinessRegistrationPage() {
  return (
    <>
      <InfoPageHero
        headingId="bizreg-title"
        eyebrow="Business Registration"
        title="Choose the Right UAE Business Setup"
        description="Compare the three jurisdictions and move forward with confidence."
        currentLabel="Business Registration"
        imageSrc="/hero/skyline.webp"
        imageAlt="Dubai skyline"
      />

      <section className="bizreg-section" aria-label="Setup types">
        <div className="container">
          <div className="bizreg-types">
            {setupTypes.map(({ id, title, description, href, icon: Icon }) => (
              <article className={`bizreg-type bizreg-type--${id}`} key={id}>
                <span className="bizreg-icon bizreg-icon--lg" aria-hidden="true">
                  <Icon />
                </span>
                <div className="bizreg-type__body">
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <Link className="bizreg-link" href={href}>
                    Explore
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <InfoSection
        headingId="bizreg-steps-title"
        eyebrow="Six Guided Steps"
        title="A Simple Application"
        lede="Complete your application in minutes. Save and resume anytime."
        tone="soft"
      >
        <InfoCardGrid items={registrationSteps} />
        <div className="info-page__actions">
          <Link className="btn btn--accent" href="/apply">
            Start Registration <span aria-hidden="true">→</span>
          </Link>
        </div>
      </InfoSection>

      <InfoSection
        headingId="bizreg-next-title"
        eyebrow="Next Steps"
        title="Start With an Accurate Estimate"
      >
        <div className="info-page__grid-2">
          <InfoCardGrid items={nextSteps} />
        </div>
      </InfoSection>
    </>
  );
}
