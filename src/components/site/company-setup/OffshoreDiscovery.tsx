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
              <h2>Is offshore suitable?</h2>
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
        className="setup-benefit-strip"
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
        </div>
      </section>
      <section
        id="offshore-benefits"
        className="setup-section setup-section--soft"
        aria-label="Offshore uses and limitations"
      >
        <div className="setup-paired-panels container">
          <SetupPanel
            title="What offshore may support"
            description="Depending on the structure, jurisdiction, and applicable rules."
          >
            <ul className="setup-detail-list">
              <li>Holding certain assets or investments</li>
              <li>International trading or ownership structures</li>
              <li>Succession or group-structure planning</li>
            </ul>
          </SetupPanel>
          <SetupPanel
            className="setup-panel--dark"
            title="What offshore does not automatically provide"
            description="Outcomes depend on facts, counterparties, and current law."
          >
            <ul className="setup-detail-list">
              <li>Permission to conduct onshore UAE business</li>
              <li>A bank account, visa, or tax outcome</li>
              <li>Exemption from compliance, reporting, or substance duties</li>
            </ul>
          </SetupPanel>
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
                title: 'Prepare and file',
                description: 'Complete due diligence and submit through the proper route.',
                icon: <FolderCheck />,
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
              <span className="eyebrow">After incorporation</span>
              <h2 id="offshore-operations-title">Plan the operating reality.</h2>
            </div>
          </header>
          <div className="setup-operations--three">
            <SetupPanel title="Banking">
              <span className="setup-panel__icon">
                <CircleDollarSign />
              </span>
              <p>
                Account opening is a separate decision made by financial institutions after due
                diligence.
              </p>
            </SetupPanel>
            <SetupPanel title="Records and filings">
              <span className="setup-panel__icon">
                <FolderCheck />
              </span>
              <p>Maintain required company, ownership, accounting, and compliance records.</p>
            </SetupPanel>
            <SetupPanel title="Renewal and review">
              <span className="setup-panel__icon">
                <ShieldCheck />
              </span>
              <p>Track renewals and re-check the structure when business facts or rules change.</p>
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
