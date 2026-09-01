import Image from 'next/image';
import Link from 'next/link';
import { Building2, CheckCircle2, Clock3, Globe2, Search, WalletCards } from 'lucide-react';
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
    <main className="setup-page">
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
              <h2>Plan with the right inputs</h2>
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
        className="setup-benefit-strip"
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
        aria-label="Mainland and Free Zone comparison"
      >
        <div className="container">
          <header className="setup-section__head">
            <div>
              <span className="eyebrow">Structure comparison</span>
              <h2>Mainland and Free Zone: frame the decision.</h2>
            </div>
          </header>
          <div className="setup-paired-panels">
            <SetupPanel
              title="Mainland"
              description="Often considered for a company focused on UAE market operations."
            >
              <ul className="setup-detail-list">
                <li>Emirate authority and activity route</li>
                <li>Premises requirements can vary</li>
                <li>External approvals may apply</li>
              </ul>
              <Link className="setup-card__link" href="/mainland">
                Explore Mainland
              </Link>
            </SetupPanel>
            <SetupPanel
              className="setup-panel--dark"
              title="Free Zone"
              description="Often considered for an authority-led package and operating environment."
            >
              <ul className="setup-detail-list">
                <li>Authority-specific activity catalog</li>
                <li>Package, office, and visa variables</li>
                <li>Rules for UAE market activity should be checked</li>
              </ul>
            </SetupPanel>
          </div>
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
              <h2 id="free-zone-process-title">A disciplined four-step process.</h2>
            </div>
            <p>Validate facts with the selected authority before payment or commitment.</p>
          </header>
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
                title: 'Apply',
                description: 'Prepare documents and submit through the correct route.',
                icon: <Building2 />,
              },
            ]}
          />
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
    </main>
  );
}
