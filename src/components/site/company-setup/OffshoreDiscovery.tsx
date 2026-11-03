import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  CircleDollarSign,
  Landmark,
  Percent,
  TrendingUp,
  FileText,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Globe2,
  Rocket,
  Scale,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import {
  OFFSHORE_OPTIONS,
  OFFSHORE_PLANNING,
  formatAedRange,
} from '@/lib/public-company-setup/catalog';
import { SetupCtaBand } from './SetupCtaBand';
import { SetupFaq } from './SetupFaq';
import { SetupProcess } from './SetupProcess';

type Highlight = { title: string; detail: string; icon: LucideIcon };

const heroHighlights: readonly Highlight[] = [
  { title: 'Purpose first', detail: 'Start from the intended use', icon: Globe2 },
  { title: 'Compliance aware', detail: 'Plan reporting and records', icon: ShieldCheck },
  { title: 'Professional review', detail: 'Confirm legal and tax treatment', icon: Scale },
  { title: 'Renewal planning', detail: 'Track ongoing obligations', icon: CalendarClock },
];

const suitabilityChecks = [
  'You have a defined international purpose',
  'You plan to hold assets, shares, or investments',
  'You do not need to trade inside the UAE market',
  'You can file through a registered agent',
  'You understand operating limitations',
  'You will obtain tax and legal advice',
] as const;

// Key benefits copy from the design HTML (`renderOffshore`), in its order.
const keyBenefits: readonly { title: string; icon: LucideIcon }[] = [
  { title: 'No Corporate Tax', icon: Percent },
  { title: 'No Capital Gains Tax', icon: TrendingUp },
  { title: 'No Audit Requirement', icon: FileCheck2 },
  { title: 'No Currency Restrictions', icon: CircleDollarSign },
  { title: 'Easy to Open Bank Accounts', icon: Landmark },
  { title: 'Easy to Open Bank Accounts', icon: Building2 },
  { title: 'Global Recognition & Credibility', icon: Globe2 },
];

const requirements = [
  'Passport copy for each shareholder and director',
  'Passport-size photograph',
  'Proof of address, as requested by the agent',
  'Shareholder resolution for multiple shareholders',
  'Attested corporate documents for corporate shareholders',
  'Business plan, if requested for bank onboarding',
  'Source-of-funds and due-diligence records',
] as const;

export function OffshoreDiscovery() {
  const { baseRange, baseTimeline, fees, timeline } = OFFSHORE_PLANNING;

  return (
    <div className="setup-page offshore-page">
      <section id="setup-hero" className="offshore-hero" aria-labelledby="offshore-title">
        <div className="offshore-hero__media" aria-hidden="true">
          <Image
            src="/company-setup/offshore-hero.webp"
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
              <li aria-current="page">Offshore</li>
            </ol>
          </nav>
          <div className="offshore-hero__copy">
            <span className="eyebrow eyebrow--accent">Offshore company setup</span>
            <h1 id="offshore-title" className="offshore-hero__title">
              International structure. Asset holding. <em>Clear compliance.</em>
            </h1>
            <p>
              Explore accepted UAE offshore authority records as a planning starting point.
              Suitability, banking, tax, ownership, and compliance outcomes require case-specific
              professional guidance.
            </p>
            <div className="cta-row">
              <Link className="btn btn--accent btn--lg" href="/estimate?jurisdiction=offshore">
                Calculate My Setup Cost
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="btn btn--outline btn--lg" href="/apply">
                Start Registration
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="offshore-hero__highlights" aria-label="Offshore planning principles">
              {heroHighlights.map(({ title, detail, icon: Icon }) => (
                <li key={title}>
                  <span className="bizreg-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="offshore-suitability" aria-labelledby="offshore-suitability-title">
            <h2 id="offshore-suitability-title">Why Choose Offshore?</h2>
            <p>Is offshore suitable? Start with purpose and qualified review.</p>
            <ul className="offshore-checks">
              {suitabilityChecks.map((item) => (
                <li key={item}>
                  <CheckCircle2 aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section
        id="offshore-jurisdictions"
        className="bizreg-section"
        aria-labelledby="offshore-jurisdictions-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">
              Filter: Choose your offshore jurisdiction
            </span>
            <h2 id="offshore-jurisdictions-title">Choose Your Offshore Jurisdiction</h2>
            <p>Select the jurisdiction that best suits your business objectives.</p>
          </header>
          <div className="offshore-jurisdictions">
            {OFFSHORE_OPTIONS.map((item, index) => (
              <article className="offshore-jurisdiction" key={item.id}>
                <div className="offshore-jurisdiction__media">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="(min-width: 900px) 400px, 100vw"
                    style={{ objectPosition: `${20 + index * 30}% 60%` }}
                  />
                </div>
                <div className="offshore-jurisdiction__body">
                  <header className="offshore-jurisdiction__head">
                    <h3>{item.name}</h3>
                    <p>
                      {item.name} — {item.regionLabel}
                    </p>
                  </header>
                  <ul className="offshore-checks offshore-checks--compact">
                    {item.highlights.map((point) => (
                      <li key={point}>
                        <CheckCircle2 aria-hidden="true" />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <Link className="bizreg-link" href={item.href}>
                    {item.authoritySlug ? 'View Details' : 'Open Estimator'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="offshore-center">
            <Link className="btn btn--outline" href="/estimate?jurisdiction=offshore">
              Compare Jurisdictions
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="offshore-benefits"
        className="bizreg-section bizreg-section--tight"
        aria-labelledby="offshore-benefits-title"
      >
        <div className="container">
          <div className="offshore-support">
            <header className="bizreg-head">
              <span className="eyebrow eyebrow--accent">Key Benefits</span>
              <h2 id="offshore-benefits-title">Key Benefits of Offshore Companies</h2>
            </header>
            <ul className="offshore-support__grid">
              {keyBenefits.map(({ title, icon: Icon }, index) => (
                <li key={`${title}-${index}`}>
                  <span className="bizreg-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <strong>{title}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="offshore-process"
        className="bizreg-section bizreg-section--tight"
        aria-labelledby="offshore-process-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">How It Works</span>
            <h2 id="offshore-process-title">How to Set Up Your Offshore Company</h2>
            <p>A simple and transparent process to establish your offshore company.</p>
          </header>
          <div className="offshore-process-card">
            <SetupProcess
              variant="stepper"
              steps={[
                {
                  title: 'Choose & Estimate',
                  description: 'Compare authority records and build an indicative estimate.',
                  icon: <Search />,
                },
                {
                  title: 'Share Information',
                  description: 'Complete the questionnaire and share ownership records.',
                  icon: <ClipboardList />,
                },
                {
                  title: 'Review & Approvals',
                  description: 'Obtain legal, tax, and compliance guidance.',
                  icon: <UserRoundCheck />,
                },
                {
                  title: 'Company Formed',
                  description: 'Submit through the registered agent and confirm issuance.',
                  icon: <FileCheck2 />,
                },
                {
                  title: "You're Ready",
                  description: 'Keep company records current and track renewals.',
                  icon: <Rocket />,
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section
        id="offshore-operations"
        className="bizreg-section bizreg-section--tight"
        aria-label="Cost, requirements, and timeline"
      >
        <div className="setup-operations--three offshore-operations container">
          <article className="offshore-panel" aria-labelledby="offshore-cost-title">
            <header>
              <h3 id="offshore-cost-title">Estimated Offshore Setup Cost</h3>
              <p>All costs in AED</p>
            </header>
            <p className="offshore-panel__figure">{formatAedRange(baseRange)}</p>
            <p className="offshore-panel__caption">Total one-time setup cost</p>
            <dl className="offshore-rows">
              {fees.map((fee) => (
                <div key={fee.label} data-optional={fee.optional || undefined}>
                  <dt>
                    <FileText aria-hidden="true" />
                    {fee.label}
                  </dt>
                  <dd>{formatAedRange(fee)}</dd>
                </div>
              ))}
            </dl>
            <p className="offshore-panel__note">
              *Costs vary based on jurisdiction and requirements.
            </p>
            <Link className="btn btn--accent" href="/estimate?jurisdiction=offshore">
              Calculate My Exact Setup Cost
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>

          <article className="offshore-panel" aria-labelledby="offshore-requirements-title">
            <header>
              <h3 id="offshore-requirements-title">Requirements Overview</h3>
              <p>Basic documents typically required.</p>
            </header>
            <ul className="offshore-checks offshore-checks--compact">
              {requirements.map((item) => (
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

          <article className="offshore-panel" aria-labelledby="offshore-timeline-title">
            <header>
              <h3 id="offshore-timeline-title">Estimated Timeline</h3>
              <p>Average time to establish your offshore company.</p>
            </header>
            <ol className="offshore-rows offshore-rows--timeline">
              {timeline.map((step) => (
                <li key={step.label} data-optional={step.optional || undefined}>
                  <span>{step.label}</span>
                  <span>{step.range}</span>
                </li>
              ))}
              <li className="offshore-rows__total">
                <span>Total Estimated Time</span>
                <span>
                  {baseTimeline.min} – {baseTimeline.max} Working Days
                </span>
              </li>
            </ol>
          </article>
        </div>
      </section>

      <section id="setup-faq" className="bizreg-section bizreg-section--tight offshore-faq">
        <SetupFaq
          headingId="offshore-faq-title"
          eyebrow="FAQ"
          title="Frequently Asked Questions"
          lede="Common questions about offshore company formation."
          items={[
            {
              question: 'Can an offshore company operate in the UAE mainland?',
              answer:
                'Offshore structures generally have operating limitations. Confirm the permitted scope for the chosen authority and intended activity before proceeding.',
            },
            {
              question: 'Will incorporation secure a bank account?',
              answer:
                'No. Banks apply their own onboarding, risk, substance, and due-diligence criteria.',
            },
            {
              question: 'Can an offshore company sponsor UAE residence visas?',
              answer:
                'No. Offshore structures do not provide visa allocation. Consider a mainland or Free Zone route if residence visas are required.',
            },
            {
              question: 'Does Mandoob provide tax or legal advice?',
              answer:
                'No. Mandoob provides discovery and indicative planning information. Obtain advice from appropriately qualified professionals for your circumstances.',
            },
            {
              question: 'Which offshore jurisdiction should I choose?',
              answer:
                'It depends on purpose, ownership, banking needs, and adviser recommendations. Compare the accepted authority records, then confirm with qualified advisers.',
            },
            {
              question: 'What ongoing work should be planned?',
              answer:
                'Plan for renewals, company records, ownership updates, accounting, and any reporting or substance obligations that apply.',
            },
          ]}
        />
      </section>

      <SetupCtaBand
        headingId="offshore-conversion-title"
        title="Ready to Establish Your Offshore Company?"
        description="Get a clear estimate, understand the requirements and start your global business journey today."
        estimateHref="/estimate?jurisdiction=offshore"
      />
    </div>
  );
}
