import Image from 'next/image';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Globe2,
  MapPin,
  Search,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { FREE_ZONE_DIRECTORY, POPULAR_FREE_ZONES } from '@/lib/public-company-setup/catalog';
import { FreeZoneDirectory } from './FreeZoneDirectory';
import { SetupBenefitStrip } from './SetupBenefitStrip';
import { SetupConversionBand } from './SetupConversionBand';
import { SetupFaq } from './SetupFaq';
import { SetupHero } from './SetupHero';
import { SetupPanel } from './SetupPanel';
import { SetupProcess } from './SetupProcess';

export function FreeZonesDiscovery() {
  return (
    <div className="setup-page">
      <section id="setup-hero" className="setup-hero" aria-labelledby="free-zones-title">
        <SetupHero
          headingId="free-zones-title"
          eyebrow="UAE Free Zones"
          title={
            <>
              Find the zone that fits your <em>operating model.</em>
            </>
          }
          description="Compare accepted Free Zone records by location, activity fit, office format, indicative cost, and timeline before speaking with the relevant authority."
          currentLabel="Free Zones"
          imageSrc="/company-setup/free-zone-hero.webp"
          imageAlt="Modern UAE Free Zone business campus and logistics buildings"
          primaryCta={{ label: 'Browse the directory', href: '#free-zone-directory' }}
          secondaryCta={{
            label: 'Estimate Free Zone cost',
            href: '/estimate?jurisdiction=free_zone',
          }}
          checklist={
            <>
              <h2>Why Choose Free Zone?</h2>
              <ul className="setup-check-list">
                <li>
                  <CheckCircle2 />
                  Activity and license category
                </li>
                <li>
                  <CheckCircle2 />
                  Office or flexi-desk format
                </li>
                <li>
                  <CheckCircle2 />
                  Visa and operational needs
                </li>
              </ul>
            </>
          }
        />
      </section>
      <section
        id="setup-benefits"
        className="setup-benefits-shell"
        aria-label="Free Zone setup considerations"
      >
        <SetupBenefitStrip
          items={[
            {
              title: 'Structured comparison',
              detail: 'Compare accepted authority records.',
              icon: <Search />,
            },
            {
              title: 'Indicative budgets',
              detail: 'Understand planning ranges.',
              icon: <WalletCards />,
            },
            { title: 'Timeline context', detail: 'See record-level estimates.', icon: <Clock3 /> },
            {
              title: 'Location choice',
              detail: 'Compare emirate and operating context.',
              icon: <MapPin />,
            },
            {
              title: 'Workspace formats',
              detail: 'Review recorded office options.',
              icon: <Building2 />,
            },
            {
              title: 'Visa planning',
              detail: 'Account for team requirements.',
              icon: <UsersRound />,
            },
          ]}
        />
      </section>
      <section
        id="free-zone-popular"
        className="setup-section"
        aria-labelledby="popular-free-zones-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Popular records</span>
              <h2 id="popular-free-zones-title">A focused starting shortlist.</h2>
            </div>
            <p>
              These are discovery links—not rankings or recommendations. Suitability depends on your
              actual business requirements.
            </p>
          </header>
          <div className="setup-popular-grid">
            {POPULAR_FREE_ZONES.map((item, index) => (
              <article className="setup-card" key={item.id}>
                <div className="setup-card__media">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="200px"
                    style={{ objectPosition: `${index * 18}% center` }}
                  />
                </div>
                <div className="setup-card__body">
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                  <Link className="setup-card__link" href={item.href}>
                    View authority
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="cta-row" style={{ justifyContent: 'center', marginTop: 32 }}>
            <Link className="btn btn--outline" href="#free-zone-directory">
              View all Free Zones
            </Link>
          </div>
        </div>
      </section>
      <section
        id="free-zone-directory"
        className="setup-section setup-section--soft"
        aria-labelledby="free-zone-directory-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Filter and compare</span>
              <h2 id="free-zone-directory-title">Free Zone directory.</h2>
            </div>
            <p>
              Search the accepted catalog. Cost and timing labels are indicative and can change with
              package, activity, visas, and authority updates.
            </p>
          </header>
          <FreeZoneDirectory rows={FREE_ZONE_DIRECTORY} />
        </div>
      </section>
      <section
        id="free-zone-comparison"
        className="setup-section"
        aria-labelledby="free-zone-benefits-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Compare Free Zone Benefits</span>
              <h2 id="free-zone-benefits-title">Evaluate the operating fit.</h2>
            </div>
          </header>
          <div className="setup-activity-grid">
            <SetupPanel title="Activity catalog">
              <p>Compare activities available through each authority.</p>
            </SetupPanel>
            <SetupPanel title="Workspace choice">
              <p>Review flexi-desk and premises requirements.</p>
            </SetupPanel>
            <SetupPanel title="Visa planning">
              <p>Confirm package capacity and current processing rules.</p>
            </SetupPanel>
            <SetupPanel title="Market route">
              <p>Check the permitted route for UAE mainland activity.</p>
            </SetupPanel>
          </div>
          <Link className="setup-card__link" href="/mainland">
            Compare Mainland and Free Zone
          </Link>
        </div>
      </section>
      <section
        id="free-zone-cost-process"
        className="setup-section setup-section--soft"
        aria-labelledby="free-zone-process-title"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">From shortlist to setup</span>
              <h2 id="free-zone-process-title">Cost context and a five-step process.</h2>
            </div>
            <p>Validate facts with the selected authority before payment or commitment.</p>
          </header>
          <div className="setup-paired-panels">
            <SetupPanel
              className="setup-panel--dark"
              title="Estimated Free Zone Setup Cost"
              description="Indicative components vary by authority and selected package."
            >
              <ul className="setup-detail-list">
                <li>Registration and license</li>
                <li>Workspace or office</li>
                <li>Immigration and visas</li>
                <li>External approvals where applicable</li>
              </ul>
              <Link className="setup-card__link" href="/estimate?jurisdiction=free_zone">
                Calculate an indicative estimate
              </Link>
            </SetupPanel>
            <SetupPanel title="How to Start Your Business in a Free Zone">
              <SetupProcess
                steps={[
                  {
                    title: 'Define needs',
                    description: 'Confirm activity, owners, visas, and workspace.',
                    icon: <Search />,
                  },
                  {
                    title: 'Compare zones',
                    description: 'Review authority records and indicative ranges.',
                    icon: <Globe2 />,
                  },
                  {
                    title: 'Verify package',
                    description: 'Confirm current fees, inclusions, and approvals.',
                    icon: <CheckCircle2 />,
                  },
                  {
                    title: 'Prepare documents',
                    description: 'Assemble owner and company records.',
                    icon: <Building2 />,
                  },
                  {
                    title: 'Apply',
                    description: 'Submit through the correct authority route.',
                    icon: <CheckCircle2 />,
                  },
                ]}
              />
            </SetupPanel>
          </div>
        </div>
      </section>
      <section id="setup-faq" className="setup-section">
        <SetupFaq
          headingId="free-zone-faq-title"
          title="Free Zone questions"
          items={[
            {
              question: 'Which Free Zone is best?',
              answer:
                'There is no universal best option. The appropriate shortlist depends on activity, location, office, visa, operating, and budget requirements.',
            },
            {
              question: 'Do package prices include every cost?',
              answer:
                'Not necessarily. Confirm registration, license, office, immigration, visa, approval, and renewal components with the authority.',
            },
            {
              question: 'Can a Free Zone company operate in the mainland market?',
              answer:
                'The permitted route depends on the activity and applicable rules. Obtain current, case-specific guidance before operating.',
            },
            {
              question: 'Are authority timelines fixed?',
              answer:
                'No. Timelines vary with the selected package, approvals, document readiness, due diligence, and current authority processing.',
            },
          ]}
        />
      </section>
      <section
        id="setup-conversion"
        className="setup-conversion"
        aria-labelledby="free-zone-conversion-title"
      >
        <SetupConversionBand
          headingId="free-zone-conversion-title"
          title="Shortlist first. Verify next. Apply with context."
          description="Use Mandoob’s accepted records to create a practical starting point for your Free Zone setup."
          estimateHref="/estimate?jurisdiction=free_zone"
        />
      </section>
    </div>
  );
}
