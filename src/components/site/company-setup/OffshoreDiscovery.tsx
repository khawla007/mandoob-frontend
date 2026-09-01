import Image from 'next/image';
import Link from 'next/link';
import {
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FolderCheck,
  Globe2,
  Network,
  Scale,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { OFFSHORE_OPTIONS } from '@/lib/public-company-setup/catalog';
import { SetupBenefitStrip } from './SetupBenefitStrip';
import { SetupConversionBand } from './SetupConversionBand';
import { SetupFaq } from './SetupFaq';
import { SetupHero } from './SetupHero';
import { SetupPanel } from './SetupPanel';
import { SetupProcess } from './SetupProcess';

export function OffshoreDiscovery() {
  return (
    <main className="setup-page">
      <section id="setup-hero" className="setup-hero" aria-labelledby="offshore-title">
        <SetupHero
          headingId="offshore-title"
          eyebrow="UAE offshore structures"
          title={
            <>
              Structure for an <em>international purpose.</em>
            </>
          }
          description="Explore accepted UAE offshore authority records as a planning starting point. Suitability, banking, tax, ownership, and compliance outcomes require case-specific professional guidance."
          currentLabel="Offshore"
          imageSrc="/company-setup/offshore-hero.webp"
          imageAlt="International maritime trade route viewed from a UAE port"
          primaryCta={{ label: 'Estimate offshore cost', href: '/estimate?jurisdiction=offshore' }}
          secondaryCta={{ label: 'Start application', href: '/apply' }}
          checklist={
            <>
              <h2>Why Choose Offshore?</h2>
              <p>Is offshore suitable? Start with purpose and qualified review.</p>
              <ul className="setup-check-list">
                <li>
                  <CheckCircle2 />
                  You have a defined international purpose
                </li>
                <li>
                  <CheckCircle2 />
                  You understand operating limitations
                </li>
                <li>
                  <CheckCircle2 />
                  You will obtain tax and legal advice
                </li>
              </ul>
            </>
          }
        />
      </section>
      <section
        id="setup-benefits"
        className="setup-benefits-shell"
        aria-label="Offshore planning considerations"
      >
        <SetupBenefitStrip
          items={[
            { title: 'Purpose first', detail: 'Start from the intended use.', icon: <Globe2 /> },
            {
              title: 'Compliance aware',
              detail: 'Plan reporting and records.',
              icon: <ShieldCheck />,
            },
            {
              title: 'Professional review',
              detail: 'Confirm legal and tax treatment.',
              icon: <Scale />,
            },
            {
              title: 'Ownership records',
              detail: 'Prepare due-diligence information.',
              icon: <UserRoundCheck />,
            },
            {
              title: 'Renewal planning',
              detail: 'Track ongoing authority obligations.',
              icon: <ClipboardCheck />,
            },
          ]}
        />
      </section>
      <section
        id="offshore-jurisdictions"
        className="setup-section"
        aria-labelledby="offshore-jurisdictions-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Accepted authority records</span>
              <h2 id="offshore-jurisdictions-title">Compare the available starting points.</h2>
            </div>
            <p>
              These cards provide discovery paths only. They do not establish that an offshore
              structure is appropriate for a particular person or business.
            </p>
          </header>
          <div className="setup-jurisdiction-grid">
            {OFFSHORE_OPTIONS.map((item, index) => (
              <article className="setup-card" key={item.id}>
                <div className="setup-card__media">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="420px"
                    style={{ objectPosition: `${30 + index * 25}% center` }}
                  />
                </div>
                <div className="setup-card__body">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <Link className="setup-card__link" href={item.href}>
                    {item.authoritySlug ? 'View authority record' : 'Open estimator'}
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="cta-row" style={{ justifyContent: 'center', marginTop: 32 }}>
            <Link className="btn btn--outline" href="/estimate?jurisdiction=offshore">
              Compare Jurisdictions
            </Link>
          </div>
        </div>
      </section>
      <section
        id="offshore-benefits"
        className="setup-section setup-section--soft"
        aria-labelledby="offshore-benefits-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Key Benefits of Offshore Companies</span>
              <h2 id="offshore-benefits-title">What offshore may support.</h2>
            </div>
            <p>
              Potential benefits are conditional. What offshore does not automatically provide
              includes a bank account, visa, tax outcome, or permission for onshore activity.
            </p>
          </header>
          <div className="setup-activity-grid">
            <SetupPanel title="Asset holding">
              <p>May support eligible asset or investment holding.</p>
            </SetupPanel>
            <SetupPanel title="International trade">
              <p>May support suitable cross-border structures.</p>
            </SetupPanel>
            <SetupPanel title="Group structuring">
              <p>May support a reviewed ownership structure.</p>
            </SetupPanel>
            <SetupPanel title="Succession planning">
              <p>May form one part of qualified succession advice.</p>
            </SetupPanel>
          </div>
        </div>
      </section>
      <section
        id="offshore-process"
        className="setup-section"
        aria-labelledby="offshore-process-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Setup process</span>
              <h2 id="offshore-process-title">Move from purpose to verified structure.</h2>
            </div>
          </header>
          <SetupProcess
            steps={[
              {
                title: 'Define purpose',
                description: 'Document why the structure is being considered.',
                icon: <Network />,
              },
              {
                title: 'Review suitability',
                description: 'Obtain legal, tax, and compliance guidance.',
                icon: <Scale />,
              },
              {
                title: 'Select authority',
                description: 'Compare accepted records and current requirements.',
                icon: <ClipboardCheck />,
              },
              {
                title: 'Prepare records',
                description: 'Complete ownership and due-diligence documents.',
                icon: <FolderCheck />,
              },
              {
                title: 'File and verify',
                description: 'Submit through the proper route and confirm issuance.',
                icon: <CheckCircle2 />,
              },
            ]}
          />
        </div>
      </section>
      <section
        id="offshore-operations"
        className="setup-section setup-section--soft"
        aria-labelledby="offshore-operations-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Planning overview</span>
              <h2 id="offshore-operations-title">Cost, requirements, and timeline.</h2>
            </div>
          </header>
          <div className="setup-operations--three">
            <SetupPanel title="Estimated Offshore Setup Cost">
              <span className="setup-panel__icon">
                <CircleDollarSign />
              </span>
              <p>
                Registration, agent, document, and renewal components vary. Use the estimator for an
                indicative view.
              </p>
            </SetupPanel>
            <SetupPanel title="Requirements Overview">
              <span className="setup-panel__icon">
                <FolderCheck />
              </span>
              <p>
                Prepare ownership, identity, purpose, due-diligence, and source-of-funds records as
                required.
              </p>
            </SetupPanel>
            <SetupPanel title="Estimated Timeline">
              <span className="setup-panel__icon">
                <ShieldCheck />
              </span>
              <p>
                Timing is indicative and depends on complete records, due diligence, and authority
                processing.
              </p>
            </SetupPanel>
          </div>
        </div>
      </section>
      <section id="setup-faq" className="setup-section">
        <SetupFaq
          headingId="offshore-faq-title"
          title="Offshore setup questions"
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
              question: 'Does Mandoob provide tax or legal advice?',
              answer:
                'No. Mandoob provides discovery and indicative planning information. Obtain advice from appropriately qualified professionals for your circumstances.',
            },
            {
              question: 'What ongoing work should be planned?',
              answer:
                'Plan for renewals, company records, ownership updates, accounting, and any reporting or substance obligations that apply.',
            },
          ]}
        />
      </section>
      <section
        id="setup-conversion"
        className="setup-conversion"
        aria-labelledby="offshore-conversion-title"
      >
        <SetupConversionBand
          headingId="offshore-conversion-title"
          title="Start with purpose. Continue with verification."
          description="Build an indicative cost view, then validate suitability and current requirements before applying."
          estimateHref="/estimate?jurisdiction=offshore"
        />
      </section>
    </main>
  );
}
