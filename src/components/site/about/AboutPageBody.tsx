import Image from 'next/image';
import {
  Medal,
  BadgeCheck,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Handshake,
  Headphones,
  ListChecks,
  MapPinned,
  PanelTop,
  ScanSearch,
  ShieldCheck,
  Target,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

import { PageScenicHero } from '../about-contact/PageScenicHero';
import { PublicConversionBand } from '../about-contact/PublicConversionBand';

const highlights = [
  {
    value: '1',
    title: 'Company workspace',
    description: 'One workspace for each company',
    icon: <Building2 />,
  },
  {
    value: '1',
    title: 'Assigned PRO',
    description: 'A defined point of coordination',
    icon: <UserRoundCheck />,
  },
  {
    value: '3',
    title: 'Setup jurisdictions',
    description: 'Mainland, Free Zone and Offshore',
    icon: <MapPinned />,
  },
  {
    value: '5',
    title: 'Guided stages',
    description: 'From request to company record',
    icon: <ListChecks />,
  },
] as const;

const values = [
  {
    title: 'Transparency',
    description: 'We believe in clear pricing, honest advice and zero hidden charges.',
    icon: <Eye />,
  },
  {
    title: 'Integrity',
    description: "We follow ethical practices and always put our clients' interests first.",
    icon: <ShieldCheck />,
  },
  {
    title: 'Excellence',
    description: 'We are committed to delivering high-quality service every time.',
    icon: <Medal />,
  },
  {
    title: 'Customer Success',
    description: 'Your success is our priority. We are with you at every step and beyond.',
    icon: <UsersRound />,
  },
] as const;

const processSteps = [
  {
    title: 'Estimate',
    description: 'Get an instant cost estimate based on your requirements.',
    icon: <Calculator />,
  },
  {
    title: 'Share Details',
    description: 'Fill out our guided questionnaire with your business information.',
    icon: <ClipboardCheck />,
  },
  {
    title: 'Review & Approve',
    description: 'We review your details and share the next steps.',
    icon: <ScanSearch />,
  },
  {
    title: 'We Handle the Rest',
    description: 'Sit back while we take care of registration and documentation.',
    icon: <Handshake />,
  },
  {
    title: 'You Focus on Growth',
    description: 'Start your business with confidence and support.',
    icon: <CheckCircle2 />,
  },
] as const;

const teamFunctions = [
  {
    title: 'Product',
    description: 'Shapes the workspace and the tools that organize company work.',
    icon: <PanelTop />,
  },
  {
    title: 'UAE Operations',
    description: 'Coordinates practical company setup and administration workflows.',
    icon: <MapPinned />,
  },
  {
    title: 'Customer Support',
    description: 'Helps customers navigate the platform and their next action.',
    icon: <Headphones />,
  },
  {
    title: 'Compliance Coordination',
    description: 'Supports orderly information and document review across the process.',
    icon: <BadgeCheck />,
  },
] as const;

export function AboutPageBody() {
  return (
    <>
      <PageScenicHero
        className="about-page__hero"
        headingId="about-page-title"
        eyebrow="About Us"
        title={
          <>
            Your Trusted Partner for <br />
            <span className="u-accent">UAE Business Success</span>
          </>
        }
        description="We simplify business setup in the UAE for entrepreneurs, startups and investors with transparent guidance, expert support and end-to-end assistance."
        currentLabel="About Us"
        imageSrc="/hero/about-skyline.webp"
        imageAlt="Dubai skyline with the Burj Khalifa on a clear day"
        features={[
          {
            title: 'Experienced',
            description: 'Experts',
            icon: <UsersRound />,
          },
          {
            title: 'Transparent',
            description: 'Process',
            icon: <ShieldCheck />,
          },
          {
            title: 'Dedicated',
            description: 'Support',
            icon: <Headphones />,
          },
        ]}
      />

      <section className="about-page__stats" aria-labelledby="about-highlights-title">
        <div className="container">
          <h2 id="about-highlights-title" className="visually-hidden">
            Built around clear ownership
          </h2>
          <ul className="about-page__highlights-list">
            {highlights.map((highlight) => (
              <li key={highlight.title}>
                <span className="about-page__highlight-icon" aria-hidden="true">
                  {highlight.icon}
                </span>
                <strong className="about-page__highlight-value">{highlight.value}</strong>
                <h3>{highlight.title}</h3>
                <p>{highlight.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="about-page__who" aria-labelledby="about-story-title">
        <div className="about-page__who-grid container">
          <div className="about-page__who-image">
            <Image
              src="/hero/about-meeting.webp"
              alt="Business setup consultant meeting with two entrepreneurs at an office table"
              fill
              sizes="(min-width: 1280px) 34vw, (min-width: 900px) 38vw, 100vw"
            />
          </div>

          <div className="about-page__story">
            <span className="eyebrow eyebrow--accent">Who we are</span>
            <h2 id="about-story-title">Making Business Setup in the UAE Simple</h2>
            <p>
              We are a team of business setup and PRO experts with years of experience helping
              thousands of entrepreneurs establish their companies across Mainland, Free Zones and
              Offshore jurisdictions in the UAE.
            </p>
            <p>
              Our platform brings transparency to the entire process—from cost estimation and
              documentation to registration and beyond—so you can focus on building your business
              while we handle the complexities.
            </p>
          </div>

          <aside className="about-page__purpose" aria-label="Mission and vision">
            <article>
              <span className="eyebrow eyebrow--accent">Mission</span>
              <div className="about-page__purpose-row">
                <span className="about-page__purpose-icon" aria-hidden="true">
                  <Target />
                </span>
                <p>
                  Empower businesses to grow in the UAE by providing accurate information,
                  transparent pricing and end-to-end support at every step of the journey.
                </p>
              </div>
            </article>
            <article>
              <span className="eyebrow eyebrow--accent">Vision</span>
              <div className="about-page__purpose-row">
                <span className="about-page__purpose-icon" aria-hidden="true">
                  <Eye />
                </span>
                <p>
                  To be the most trusted and innovative business setup platform in the UAE, driving
                  entrepreneurial success.
                </p>
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section className="about-page__values" aria-labelledby="about-values-title">
        <div className="container">
          <header className="about-page__section-heading about-page__section-heading--centered">
            <span className="eyebrow eyebrow--accent">Our values</span>
            <h2 id="about-values-title">What We Stand For</h2>
            <p>The principles behind every client interaction.</p>
          </header>
          <ul className="about-page__values-list">
            {values.map((value) => (
              <li key={value.title}>
                <span className="about-page__value-icon" aria-hidden="true">
                  {value.icon}
                </span>
                <div>
                  <h3>{value.title}</h3>
                  <p>{value.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="about-page__process" aria-labelledby="about-process-title">
        <div className="container">
          <header className="about-page__section-heading about-page__section-heading--centered">
            <span className="eyebrow eyebrow--accent">Our process</span>
            <h2 id="about-process-title">A Simple Process. End-to-End Support.</h2>
            <p>From your first estimate to your first customer.</p>
          </header>
          <ol className="about-page__process-list">
            {processSteps.map((step, index) => (
              <li className="about-page__process-item" key={step.title}>
                <span className="about-page__process-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <h3>
                  <span className="about-page__process-number">{index + 1}.</span> {step.title}
                </h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="about-page__team" aria-labelledby="about-team-title">
        <div className="container">
          <div className="about-page__team-card">
            <header className="about-page__section-heading about-page__section-heading--centered">
              <span className="eyebrow eyebrow--accent">Meet our leadership</span>
              <h2 id="about-team-title">Experienced. Dedicated. Here for You.</h2>
            </header>
            <ul className="about-page__team-list">
              {teamFunctions.map((teamFunction) => (
                <li key={teamFunction.title}>
                  <span className="about-page__team-icon" aria-hidden="true">
                    {teamFunction.icon}
                  </span>
                  <div>
                    <h3>{teamFunction.title}</h3>
                    <p>{teamFunction.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <PublicConversionBand
        headingId="about-conversion-title"
        title="Ready to Start Your UAE Business?"
        description="Get a clear estimate and our experts will guide you every step of the way."
        primaryCta={{ label: 'Calculate My Setup Cost', href: '/estimate' }}
        secondaryCta={{ label: 'Contact Us', href: '/contact' }}
      />
    </>
  );
}
