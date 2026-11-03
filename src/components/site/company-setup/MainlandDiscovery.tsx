import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileText,
  Globe2,
  Link2,
  Plane,
  ShieldCheck,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { MAINLAND_EMIRATES } from '@/lib/public-company-setup/catalog';
import { SetupCtaBand } from './SetupCtaBand';
import { SetupFaq } from './SetupFaq';

/**
 * `/mainland` — layout and copy from the updated design HTML
 * (`docs/updated design mandoopp/Whole HTML`, `renderMainland`). Reuses the
 * Offshore page's hero, card and panel styles so both setup pages match.
 */

type Item = { title: string; detail: string; icon: LucideIcon };

const heroBadges: readonly Item[] = [
  { title: '100% Foreign Ownership in Most Activities', detail: '', icon: ShieldCheck },
  { title: 'Access to UAE Local Market', detail: '', icon: Users },
  { title: 'Eligible for Government Contracts', detail: '', icon: FileCheck2 },
  { title: 'Operate Across All Emirates', detail: '', icon: Globe2 },
];

/** Captions from the design HTML, keyed by catalog emirate id. */
const EMIRATE_COPY: Record<string, { caption: string; image: `/${string}` }> = {
  dubai: {
    caption: 'The business hub of UAE and international trade gateway.',
    image: '/company-setup/emirates/dubai.jpg',
  },
  abu_dhabi: {
    caption: 'Capital of UAE with strong economy and infrastructure.',
    image: '/company-setup/emirates/abu_dhabi.jpg',
  },
  sharjah: {
    caption: 'Business-friendly environment with cost-effective solutions.',
    image: '/company-setup/emirates/sharjah.jpg',
  },
  ajman: {
    caption: 'Affordable business setup with flexible regulations.',
    image: '/company-setup/emirates/ajman.jpg',
  },
  ras_al_khaimah: {
    caption: 'Growing economy with industrial opportunities.',
    image: '/company-setup/emirates/ras_al_khaimah.jpg',
  },
  fujairah: {
    caption: 'Strategic location on the Gulf of Oman.',
    image: '/company-setup/emirates/fujairah.jpg',
  },
  umm_al_quwain: {
    caption: 'Ideal for trading and industrial businesses.',
    image: '/company-setup/emirates/umm_al_quwain.jpg',
  },
};

const activities: readonly Item[] = [
  {
    title: 'Commercial',
    detail: 'Trading, E-commerce, retail, import/export and more.',
    icon: ShoppingCart,
  },
  {
    title: 'Professional',
    detail: 'Consultancy, IT services, marketing, designing, legal and more.',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Industrial',
    detail: 'Manufacturing, assembly, packaging, logistics and more.',
    icon: Building2,
  },
  {
    title: 'Tourism',
    detail: 'Travel, tourism, events, hospitality and entertainment.',
    icon: Plane,
  },
];

const licenses: readonly Item[] = [
  {
    title: 'Commercial Licence',
    detail: 'For trading and commercial activities',
    icon: Building2,
  },
  {
    title: 'Professional Licence',
    detail: 'For service and professional activities',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Industrial Licence',
    detail: 'For industrial and manufacturing activities',
    icon: Building2,
  },
  { title: 'Branch Licence', detail: 'For opening a branch of existing company', icon: Link2 },
];

const costLines = [
  ['License Fee', 'AED 9,000 – 25,000'],
  ['Government Fees', 'AED 2,000 – 5,000'],
  ['Office Space (1 Year)', 'AED 6,000 – 12,000'],
  ['Investor Visa (1)', 'AED 3,000 – 5,000'],
  ['PRO Services', 'AED 2,000 – 3,000'],
  ['Additional Services', 'AED 1,000 – 3,000'],
] as const;

const timeline = [
  ['Initial Approval', '1 – 2 Working Days'],
  ['Trade Name Reservation', '1 – 2 Working Days'],
  ['License Issuance', '3 – 7 Working Days'],
  ['Visa Processing (if applicable)', '5 – 10 Working Days'],
] as const;

const requiredDocuments = [
  'Passport copies of shareholders',
  'Visa copy (if applicable)',
  'Emirates ID copy (if applicable)',
  'Passport size photographs',
  'Initial approval application',
  'Business plan (may be required for some activities)',
  'No Objection Certificate (if applicable)',
] as const;

export function MainlandDiscovery() {
  return (
    <div className="setup-page offshore-page mainland-page">
      <section id="setup-hero" className="offshore-hero" aria-labelledby="mainland-title">
        <div className="offshore-hero__media" aria-hidden="true">
          <Image
            src="/company-setup/mainland-hero.webp"
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 900px) 60vw, 100vw"
          />
        </div>
        <div className="offshore-hero__frame container">
          <nav className="setup-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li>
                <Link href="/business-registration">Business Registration</Link>
              </li>
              <li aria-current="page">Mainland</li>
            </ol>
          </nav>
          <div className="offshore-hero__copy">
            <span className="eyebrow eyebrow--accent">Mainland business setup</span>
            <h1 id="mainland-title" className="offshore-hero__title">
              Start and Grow Your Business in the UAE Mainland
            </h1>
            <p>
              Establish your company anywhere in the UAE market with 100% foreign ownership in most
              activities, access to local market and government contracts, and complete flexibility
              to grow your business.
            </p>
            <div className="cta-row">
              <Link className="btn btn--accent btn--lg" href="/estimate?jurisdiction=mainland">
                Calculate My Setup Cost
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="btn btn--outline btn--lg" href="/apply">
                Start Registration
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="mainland-hero__badges" aria-label="Mainland setup highlights">
              {heroBadges.map(({ title, icon: Icon }) => (
                <li key={title}>
                  <Icon aria-hidden="true" />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="mainland-emirates"
        className="bizreg-section"
        aria-labelledby="mainland-emirates-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">Choose your emirate</span>
            <h2 id="mainland-emirates-title">Choose Your Emirate</h2>
            <p>Select your preferred emirate to view specific requirements and costs.</p>
          </header>
          <ul className="mainland-emirates" role="list">
            {MAINLAND_EMIRATES.map((item) => {
              const copy = EMIRATE_COPY[item.id];
              return (
                <li className="mainland-emirate" key={item.id}>
                  <div className="mainland-emirate__media">
                    <Image
                      src={copy?.image ?? item.image}
                      alt=""
                      fill
                      sizes="(min-width: 1200px) 190px, (min-width: 640px) 33vw, 50vw"
                    />
                  </div>
                  <div className="mainland-emirate__body">
                    <h3>{item.name}</h3>
                    <p>{copy?.caption ?? item.description}</p>
                    <Link className="bizreg-link" href={item.href}>
                      View Details
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section
        id="mainland-activities"
        className="bizreg-section"
        aria-labelledby="mainland-activities-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">Business activities</span>
            <h2 id="mainland-activities-title">Mainland Business Activities</h2>
            <p>
              Choose from 2,000+ business activities across commercial, professional, industrial and
              tourism sectors.
            </p>
          </header>
          <ul className="mainland-activities" role="list">
            {activities.map(({ title, detail, icon: Icon }) => (
              <li className="mainland-activity" key={title}>
                <span className="bizreg-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{detail}</p>
                <Link className="bizreg-link" href="/business-registration">
                  View Activities
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="mainland-license-cost"
        className="bizreg-section"
        aria-label="License types and estimated cost"
      >
        <div className="setup-paired-panels mainland-pair container">
          <article className="offshore-panel" aria-labelledby="mainland-license-title">
            <header>
              <h3 id="mainland-license-title">Mainland License Types</h3>
              <p>Choose the right license type for your business.</p>
            </header>
            <ul className="mainland-licenses" role="list">
              {licenses.map(({ title, detail, icon: Icon }) => (
                <li key={title}>
                  <span className="mainland-licenses__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ul>
            <Link className="btn btn--outline" href="/business-registration">
              Compare License Types
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>

          <article className="offshore-panel mainland-cost" aria-labelledby="mainland-cost-title">
            <header>
              <h3 id="mainland-cost-title">Estimated Setup Cost</h3>
              <p>Cost range for mainland company setup in the UAE.</p>
            </header>
            <p className="offshore-panel__figure">AED 19,000 – AED 45,000</p>
            <p className="offshore-panel__caption">Total one-time setup cost</p>
            <dl className="offshore-rows">
              {costLines.map(([label, value]) => (
                <div key={label}>
                  <dt>
                    <FileText aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="offshore-panel__note">
              *Costs vary based on emirate, activity and requirements.
            </p>
            <Link
              className="btn btn--accent mainland-cost__cta"
              href="/estimate?jurisdiction=mainland"
            >
              Calculate My Exact Setup Cost
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <section
        id="mainland-documents-timeline"
        className="bizreg-section"
        aria-label="Required documents and timeline"
      >
        <div className="setup-paired-panels mainland-pair container">
          <article className="offshore-panel" aria-labelledby="mainland-documents-title">
            <header>
              <h3 id="mainland-documents-title">Required Documents</h3>
              <p>Basic documents typically required for mainland setup.</p>
            </header>
            <ul className="offshore-checks offshore-checks--compact">
              {requiredDocuments.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link className="btn btn--outline" href="/document-requirements">
              View Detailed Requirements
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>

          <article className="offshore-panel" aria-labelledby="mainland-timeline-title">
            <header>
              <h3 id="mainland-timeline-title">Estimated Timeline</h3>
              <p>Average time to establish your mainland company.</p>
            </header>
            <ol className="offshore-rows offshore-rows--timeline">
              {timeline.map(([label, range]) => (
                <li key={label}>
                  <span>{label}</span>
                  <span>{range}</span>
                </li>
              ))}
              <li className="offshore-rows__total">
                <span>Total Estimated Time</span>
                <span>7 – 15 Working Days</span>
              </li>
            </ol>
            <Link className="btn btn--outline" href="/business-registration">
              View Full Process
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>

      <section id="setup-faq" className="bizreg-section offshore-faq">
        <SetupFaq
          headingId="mainland-faq-title"
          eyebrow="FAQ"
          title="Frequently Asked Questions"
          lede="Common questions about mainland company formation."
          items={[
            {
              question: 'What is a mainland company in the UAE?',
              answer:
                "A mainland company is licensed by an emirate's economic department and can trade directly anywhere in the UAE and internationally.",
            },
            {
              question: 'Can foreigners have 100% ownership in a mainland company?',
              answer:
                'Yes, 100% foreign ownership is permitted for most commercial and industrial activities. Certain strategic activities retain specific ownership rules.',
            },
            {
              question: 'What are the costs involved in mainland company setup?',
              answer:
                'Typical one-time setup costs range from AED 19,000 to AED 45,000, including licence, government, office, visa and PRO fees.',
            },
            {
              question: 'Do I need a physical office for mainland company setup?',
              answer:
                'A registered office address and Ejari/Tenancy contract are normally required. Flexi-desk options may be available for selected packages.',
            },
            {
              question: 'Which emirate is best for mainland business setup?',
              answer:
                'Dubai offers the broadest market access; Sharjah and Ajman are cost-effective; Abu Dhabi suits industrial and government work.',
            },
            {
              question: 'Can I do business anywhere in the UAE mainland?',
              answer:
                'Yes, a mainland licence permits trading across all seven emirates and internationally.',
            },
          ]}
        />
      </section>

      <SetupCtaBand
        headingId="mainland-conversion-title"
        title="Ready to Start Your Mainland Business?"
        description="Get a clear estimate, understand your requirements and begin your business setup journey today."
        estimateHref="/estimate?jurisdiction=mainland"
      />
    </div>
  );
}
