import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BadgePercent,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileCheck2,
  Layers,
  MapPin,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { FREE_ZONE_DIRECTORY, POPULAR_FREE_ZONES } from '@/lib/public-company-setup/catalog';
import { FreeZoneDirectory } from './FreeZoneDirectory';
import { SetupCtaBand } from './SetupCtaBand';
import { SetupFaq } from './SetupFaq';
import { SetupProcess } from './SetupProcess';

/**
 * `/free-zones` — layout and copy from the updated design HTML
 * (`docs/updated design mandoopp/Whole HTML`, `renderFreeZones`). Reuses the
 * Offshore/Mainland hero, card and panel styles; the filterable directory is
 * the existing client `FreeZoneDirectory`.
 */

type Item = { title: string; detail: string; icon: LucideIcon };

const whyChoose = [
  '100% foreign ownership',
  '0% personal & corporate tax (in many zones)',
  'Full profit & capital repatriation',
  'No import/export restrictions',
  'Simplified setup & minimal paperwork',
  'Modern infrastructure & global connectivity',
  'Multiple visa & office options',
  'Cost-effective solutions',
] as const;

const heroBadges: readonly Omit<Item, 'detail'>[] = [
  { title: '45+ Free Zone Options', icon: Building2 },
  { title: '100% Foreign Ownership', icon: ShieldCheck },
  { title: '0% Personal & Corporate Tax (in many zones)', icon: BadgePercent },
  { title: 'Full Profit & Capital Repatriation', icon: Download },
  { title: 'Wide Range of Business Activities', icon: CheckCircle2 },
];

/** Design copy and photos for the popular-zone cards, keyed by catalog name. */
const ZONE_CARD: Record<string, { logo: string; description: string; image: `/${string}` }> = {
  DMCC: {
    logo: 'DMCC',
    description: "World's flagship free zone for commodities trade and enterprise.",
    image: '/company-setup/free-zones/dmcc.jpg',
  },
  JAFZA: {
    logo: 'Jafza',
    description: 'The largest free zone in the world, ideal for logistics and manufacturing.',
    image: '/company-setup/free-zones/jafza.jpg',
  },
  IFZA: {
    logo: 'IFZA',
    description: 'Cost-effective solutions for startups, SMEs and freelancers.',
    image: '/company-setup/free-zones/ifza.jpg',
  },
  RAKEZ: {
    logo: 'RAKEZ',
    description: 'Flexible business setup options for growing enterprises.',
    image: '/company-setup/free-zones/rakez.jpg',
  },
  SHAMS: {
    logo: 'SHAMS',
    description: 'Sharjah Media City free zone for media and digital businesses.',
    image: '/company-setup/free-zones/shams.jpg',
  },
  'Meydan Free Zone': {
    logo: 'meydan FZ',
    description: 'Strategic location with easy access to global markets.',
    image: '/company-setup/free-zones/meydan.jpg',
  },
};

const benefits: readonly Item[] = [
  { title: 'Ownership', detail: '100% foreign ownership in all free zones.', icon: UsersRound },
  {
    title: 'Tax Benefits',
    detail: '0% personal and corporate tax in many zones.',
    icon: BadgePercent,
  },
  { title: 'Repatriation', detail: 'Full repatriation of profits and capital.', icon: Download },
  {
    title: 'Ease of Setup',
    detail: 'Fast and hassle-free registration process.',
    icon: FileCheck2,
  },
  {
    title: 'Business Flexibility',
    detail: 'Wide range of business activities allowed.',
    icon: Layers,
  },
  {
    title: 'Strategic Location',
    detail: 'World-class infrastructure and global connectivity.',
    icon: MapPin,
  },
  {
    title: 'Cost-Effective',
    detail: 'Flexible packages for startups and SMEs.',
    icon: CircleDollarSign,
  },
];

export function FreeZonesDiscovery() {
  const popular = POPULAR_FREE_ZONES.slice(0, 4);

  return (
    <div className="setup-page offshore-page mainland-page free-zones-page">
      <section id="setup-hero" className="offshore-hero" aria-labelledby="free-zones-title">
        <div className="offshore-hero__media" aria-hidden="true">
          <Image
            src="/company-setup/free-zone-hero.webp"
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
              <li aria-current="page">Free Zones</li>
            </ol>
          </nav>
          <div className="offshore-hero__copy">
            <span className="eyebrow eyebrow--accent">Free zone business setup</span>
            <h1 id="free-zones-title" className="offshore-hero__title">
              Explore 45+ UAE Free Zones and Find the Right Fit for Your Business
            </h1>
            <p>
              Enjoy 100% foreign ownership, tax benefits, full repatriation of profits, and
              world-class infrastructure with simplified setup processes designed to help your
              business grow.
            </p>
            <div className="cta-row">
              <Link className="btn btn--accent btn--lg" href="/estimate?jurisdiction=free_zone">
                Calculate My Setup Cost
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="btn btn--outline btn--lg" href="#free-zone-directory">
                Explore Free Zones
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <ul className="mainland-hero__badges" aria-label="Free zone highlights">
              {heroBadges.map(({ title, icon: Icon }) => (
                <li key={title}>
                  <Icon aria-hidden="true" />
                  {title}
                </li>
              ))}
            </ul>
          </div>
          <aside className="offshore-suitability" aria-labelledby="free-zones-why-title">
            <h2 id="free-zones-why-title">Why Choose Free Zone?</h2>
            <ul className="offshore-checks">
              {whyChoose.map((item) => (
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
        id="free-zone-popular"
        className="bizreg-section"
        aria-labelledby="free-zone-popular-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">Popular free zones</span>
            <h2 id="free-zone-popular-title">Popular Free Zones</h2>
            <p>Discover some of the most preferred free zones in the UAE.</p>
          </header>
          <div className="home-knowledge-grid free-zone-cards">
            {popular.map((zone) => {
              const card = ZONE_CARD[zone.name];
              return (
                <article className="home-knowledge-card" key={zone.id}>
                  <div className="home-knowledge-card__media">
                    <Image
                      src={card?.image ?? zone.image}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 100vw, (max-width: 1100px) 50vw, 25vw"
                    />
                    <span>{card?.logo ?? zone.name}</span>
                  </div>
                  <div className="home-knowledge-card__body">
                    <h3>{zone.name}</h3>
                    <p>{card?.description ?? zone.description}</p>
                    <Link className="home-text-link" href={zone.href}>
                      View Details <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="offshore-center">
            <Link className="bizreg-link" href="/free-zones/directory">
              View All 45+ Free Zones
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="free-zone-directory"
        className="bizreg-section"
        aria-labelledby="free-zone-directory-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <span className="eyebrow eyebrow--accent">Browse &amp; compare</span>
            <h2 id="free-zone-directory-title">Browse All Free Zones</h2>
            <p>Filter by emirate, activity, office and budget.</p>
          </header>
          <FreeZoneDirectory rows={FREE_ZONE_DIRECTORY} />
        </div>
      </section>

      <section id="free-zone-benefits" className="bizreg-section" aria-label="Free zone benefits">
        <div className="container">
          <ul className="offshore-support__grid free-zone-benefits" role="list">
            {benefits.map(({ title, detail, icon: Icon }) => (
              <li key={title}>
                <span className="bizreg-icon" aria-hidden="true">
                  <Icon />
                </span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="free-zone-cost-process"
        className="bizreg-section"
        aria-label="Estimated cost and setup process"
      >
        <div className="free-zone-cost-process container">
          <article className="offshore-panel free-zone-cost" aria-labelledby="free-zone-cost-title">
            <header>
              <h3 id="free-zone-cost-title">Estimated Free Zone Setup Cost</h3>
              <p>Starting from</p>
            </header>
            <p className="offshore-panel__figure">AED 12,000 – AED 50,000+</p>
            <p className="offshore-panel__caption">
              Cost varies based on free zone, business activity, visas, and office requirements.
            </p>
            <Link
              className="btn btn--accent mainland-cost__cta"
              href="/estimate?jurisdiction=free_zone"
            >
              Calculate My Exact Setup Cost
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
          <article className="offshore-panel" aria-labelledby="free-zone-process-title">
            <header>
              <h3 id="free-zone-process-title">How to Start Your Business in a Free Zone</h3>
              <p>Simple steps to get your business up and running.</p>
            </header>
            <SetupProcess
              variant="stepper"
              steps={[
                {
                  title: 'Choose & Estimate',
                  description: 'Select your free zone, business activity and get an instant quote.',
                  icon: null,
                },
                {
                  title: 'Share Information',
                  description: 'Fill out the questionnaire and share required documents.',
                  icon: null,
                },
                {
                  title: 'Review & Approvals',
                  description: 'We review your application and handle internal approvals.',
                  icon: null,
                },
                {
                  title: 'License Issued',
                  description: 'Your license is issued and your company is registered.',
                  icon: null,
                },
                {
                  title: 'Start Your Business',
                  description: 'Open bank account, apply for visas and start your operations.',
                  icon: null,
                },
              ]}
            />
          </article>
        </div>
      </section>

      <section id="setup-faq" className="bizreg-section offshore-faq">
        <SetupFaq
          headingId="free-zones-faq-title"
          eyebrow="FAQ"
          title="Frequently Asked Questions"
          lede="Common questions about UAE free zone companies."
          items={[
            {
              question: 'What is a free zone company in the UAE?',
              answer:
                'A free zone company is registered inside a designated economic zone and offers 100% foreign ownership, tax benefits and simplified incorporation.',
            },
            {
              question: 'Can I operate in the UAE mainland with a free zone company?',
              answer:
                'Free zone entities generally operate within their zone or internationally. Mainland activity requires a distributor or a mainland branch/permit.',
            },
            {
              question: 'Is there corporate tax in UAE free zones?',
              answer:
                'Qualifying free zone entities may benefit from 0% corporate tax on qualifying income, subject to substance and compliance conditions.',
            },
            {
              question: 'Do I need to visit the UAE to start a free zone company?',
              answer:
                'Many free zones allow remote incorporation, though bank account opening, biometrics or specific visas may require presence.',
            },
            {
              question: 'How many visas can I get with a free zone licence?',
              answer:
                'Visa eligibility depends on the package and office space. Packages commonly support 0–6 visas and can be upgraded.',
            },
            {
              question: 'How long does it take to set up a free zone company?',
              answer:
                'Simple digital jurisdictions can issue a licence in 1–3 working days; others take 3–7 working days.',
            },
          ]}
        />
      </section>

      <SetupCtaBand
        headingId="free-zones-conversion-title"
        title="Ready to Start Your Free Zone Business?"
        description="Get a clear estimate, explore available free zones and start your business setup journey today."
        estimateHref="/estimate?jurisdiction=free_zone"
      />
    </div>
  );
}
