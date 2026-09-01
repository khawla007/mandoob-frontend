import Image from 'next/image';
import Link from 'next/link';
import {
  BriefcaseBusiness,
  Factory,
  FileCheck2,
  Landmark,
  MapPin,
  Plane,
  ShieldCheck,
} from 'lucide-react';
import { MAINLAND_EMIRATES } from '@/lib/public-company-setup/catalog';
import { SetupBenefitStrip } from './SetupBenefitStrip';
import { SetupConversionBand } from './SetupConversionBand';
import { SetupFaq } from './SetupFaq';
import { SetupHero } from './SetupHero';
import { SetupPanel } from './SetupPanel';

const activities = [
  {
    title: 'Commercial',
    detail: 'Trading and related commercial activities.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Professional',
    detail: 'Professional and specialist service activities.',
    icon: Landmark,
  },
  {
    title: 'Industrial',
    detail: 'Manufacturing or production, subject to approvals.',
    icon: Factory,
  },
  {
    title: 'Tourism',
    detail: 'Tourism activities with sector-specific requirements.',
    icon: Plane,
  },
];

export function MainlandDiscovery() {
  return (
    <main className="setup-page">
      <section id="setup-hero" className="setup-hero" aria-labelledby="mainland-title">
        <SetupHero
          headingId="mainland-title"
          eyebrow="UAE mainland"
          title={
            <>
              Build close to your <em>market.</em>
            </>
          }
          description="Explore emirate-level setup routes for companies that plan to operate in the UAE market. Costs, permissions, and timelines remain activity and authority dependent."
          currentLabel="Mainland"
          imageSrc="/company-setup/mainland-hero.webp"
          imageAlt="Contemporary UAE commercial district representing mainland company setup"
          primaryCta={{ label: 'Estimate mainland cost', href: '/estimate?jurisdiction=mainland' }}
          secondaryCta={{ label: 'Start application', href: '/apply' }}
        />
      </section>
      <section
        id="setup-benefits"
        className="setup-benefit-strip"
        aria-label="Mainland setup considerations"
      >
        <SetupBenefitStrip
          items={[
            {
              title: 'Local market access',
              detail: 'Plan for UAE-facing operations.',
              icon: <MapPin />,
            },
            {
              title: 'Activity-led licensing',
              detail: 'Requirements vary by selected activity.',
              icon: <FileCheck2 />,
            },
            {
              title: 'Authority-specific route',
              detail: 'Confirm the responsible emirate authority.',
              icon: <ShieldCheck />,
            },
          ]}
        />
      </section>
      <section
        id="mainland-emirates"
        className="setup-section"
        aria-labelledby="mainland-emirates-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Choose an emirate</span>
              <h2 id="mainland-emirates-title">Seven routes into the mainland.</h2>
            </div>
            <p>
              Start with location, then validate the activity, premises, ownership, and approval
              requirements that apply to your case.
            </p>
          </header>
          <div className="setup-emirate-grid">
            {MAINLAND_EMIRATES.map((item, index) => (
              <article className="setup-card" key={item.id}>
                <div className="setup-card__media">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="180px"
                    style={{ objectPosition: `${index * 15}% center` }}
                  />
                </div>
                <div className="setup-card__body">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <Link className="setup-card__link" href={item.href}>
                    Estimate
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="mainland-activities"
        className="setup-section setup-section--soft"
        aria-labelledby="mainland-activities-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Business activities</span>
              <h2 id="mainland-activities-title">Define what the company will do.</h2>
            </div>
            <p>
              The selected activity can affect the license category, external approvals, premises,
              and final cost.
            </p>
          </header>
          <div className="setup-activity-grid">
            {activities.map(({ title, detail, icon: Icon }) => (
              <article className="setup-panel" key={title}>
                <span className="setup-panel__icon">
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        id="mainland-license-cost"
        className="setup-section"
        aria-label="Mainland license and cost guidance"
      >
        <div className="setup-paired-panels container">
          <SetupPanel
            title="License planning"
            description="The correct license follows the approved activity and authority route."
          >
            <ul className="setup-detail-list">
              <li>Confirm business activity and legal form</li>
              <li>Check any external or sector approvals</li>
              <li>Validate premises and naming requirements</li>
            </ul>
          </SetupPanel>
          <SetupPanel
            className="setup-panel--dark"
            title="Indicative cost components"
            description="Use the estimator for planning—not a binding quotation."
          >
            <ul className="setup-detail-list">
              <li>Registration and license fees</li>
              <li>Office or premises requirements</li>
              <li>Immigration, establishment, and related services</li>
            </ul>
            <Link className="setup-card__link" href="/estimate?jurisdiction=mainland">
              Build an estimate
            </Link>
          </SetupPanel>
        </div>
      </section>
      <section
        id="mainland-documents-timeline"
        className="setup-section setup-section--soft"
        aria-label="Documents and timeline"
      >
        <div className="setup-paired-panels container">
          <SetupPanel title="Typical documents to prepare">
            <ul className="setup-detail-list">
              <li>Shareholder and manager identification</li>
              <li>Proposed trade names and activity details</li>
              <li>Corporate documents when a shareholder is a company</li>
              <li>Premises evidence where required</li>
            </ul>
          </SetupPanel>
          <SetupPanel title="Setup timeline">
            <ul className="setup-detail-list">
              <li>Initial activity and name review</li>
              <li>Application and approval processing</li>
              <li>Premises and final license steps</li>
            </ul>
            <p>
              Timing is indicative and can change with approvals, document readiness, and authority
              processing.
            </p>
          </SetupPanel>
        </div>
      </section>
      <section id="setup-faq" className="setup-section">
        <SetupFaq
          headingId="mainland-faq-title"
          title="Mainland setup questions"
          items={[
            {
              question: 'Can a mainland company trade across the UAE?',
              answer:
                'A mainland route is generally used for UAE-facing operations, but the exact permitted activities and conditions follow the issued license and applicable approvals.',
            },
            {
              question: 'Is a physical office always required?',
              answer:
                'Premises requirements depend on the activity, legal form, authority, and current rules. Confirm the requirement before committing to a lease.',
            },
            {
              question: 'Are the estimator figures final?',
              answer:
                'No. They are indicative planning figures based on accepted records and should be verified with the relevant authority or adviser.',
            },
          ]}
        />
      </section>
      <section
        id="setup-conversion"
        className="setup-conversion"
        aria-labelledby="mainland-conversion-title"
      >
        <SetupConversionBand
          headingId="mainland-conversion-title"
          title="Turn your mainland idea into a practical plan."
          description="Compare indicative costs first, then begin an application when your activity and location are clear."
          estimateHref="/estimate?jurisdiction=mainland"
        />
      </section>
    </main>
  );
}
