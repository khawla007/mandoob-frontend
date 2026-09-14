import Image from 'next/image';
import {
  BadgeCheck,
  Blocks,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Eye,
  FileSearch,
  FolderKanban,
  Handshake,
  Headphones,
  History,
  ListChecks,
  MapPinned,
  MessagesSquare,
  PanelTop,
  ScanSearch,
  ShieldCheck,
  Target,
  Upload,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

import { PageScenicHero } from '../about-contact/PageScenicHero';
import { PublicConversionBand } from '../about-contact/PublicConversionBand';
import { RaisedInfoStrip } from '../about-contact/RaisedInfoStrip';

const capabilityItems = [
  {
    title: 'One company workspace',
    description: 'A focused workspace for each company and its setup activity.',
    icon: <Building2 />,
  },
  {
    title: 'One assigned PRO',
    description: 'A clear point of coordination for company administration.',
    icon: <UserRoundCheck />,
  },
  {
    title: 'Guided setup stages',
    description: 'Structured steps make each part of setup easier to follow.',
    icon: <ListChecks />,
  },
  {
    title: 'Controlled document review',
    description: 'Documents move through an organized review workflow.',
    icon: <FileSearch />,
  },
  {
    title: 'Auditable activity history',
    description: 'Key actions remain visible in a clear company record.',
    icon: <History />,
  },
] as const;

const values = [
  {
    title: 'Clarity',
    description: 'We explain the work, the next step, and who is responsible.',
    icon: <Eye />,
  },
  {
    title: 'Accountability',
    description: 'We make ownership visible throughout the company journey.',
    icon: <ShieldCheck />,
  },
  {
    title: 'Practical support',
    description: 'We turn administrative work into clear, useful actions.',
    icon: <Handshake />,
  },
  {
    title: 'Customer focus',
    description: 'We design each interaction around what a business needs next.',
    icon: <UsersRound />,
  },
] as const;

const processSteps = [
  {
    title: 'Share your needs',
    description: 'Tell us about the company you are planning or operating.',
    icon: <ClipboardCheck />,
  },
  {
    title: 'Prepare details',
    description: 'Add the information and documents relevant to the request.',
    icon: <Upload />,
  },
  {
    title: 'Review together',
    description: 'Your assigned PRO checks the available details and next actions.',
    icon: <ScanSearch />,
  },
  {
    title: 'Follow the stages',
    description: 'Work progresses through visible, guided company setup stages.',
    icon: <FolderKanban />,
  },
  {
    title: 'Keep the record',
    description: 'Return to the workspace for documents and activity history.',
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
        eyebrow="About Mandoob"
        title={
          <>
            Practical support for <span className="u-accent">UAE businesses.</span>
          </>
        }
        description="Mandoob brings company setup guidance and business administration into one clear workspace, with visible stages and a defined point of coordination."
        currentLabel="About"
        imageSrc="/hero/skyline.webp"
        imageAlt="Dubai skyline at sunset"
        features={[
          {
            title: 'Clear workspace',
            description: 'Company details in one place',
            icon: <Blocks />,
          },
          {
            title: 'Guided setup',
            description: 'Structured stages to follow',
            icon: <Compass />,
          },
          {
            title: 'Accountable support',
            description: 'A defined point of coordination',
            icon: <MessagesSquare />,
          },
        ]}
      />

      <RaisedInfoStrip
        headingId="about-capabilities-title"
        heading="How Mandoob supports company work"
        items={capabilityItems}
      />

      <section className="about-page__who" aria-labelledby="about-story-title">
        <div className="about-page__who-grid container">
          <div className="about-page__who-image">
            <Image
              src="/hero/pro-firm-operations.webp"
              alt="Company documents arranged on an office desk with the Dubai skyline in the background"
              fill
              sizes="(min-width: 1280px) 34vw, (min-width: 900px) 38vw, 100vw"
            />
          </div>

          <div className="about-page__story">
            <span className="eyebrow eyebrow--accent">Who we are</span>
            <h2 id="about-story-title">Company support made easier to understand.</h2>
            <p>
              Mandoob is built around a simple idea: UAE company setup and administration should be
              easier to follow. We bring the work into one workspace for each company, with one
              assigned PRO to coordinate the journey.
            </p>
            <p>
              From initial details to document review and ongoing activity, the platform keeps
              stages, responsibilities, and records visible without overstating what has happened.
            </p>
          </div>

          <aside className="about-page__purpose" aria-label="Mission and vision">
            <article>
              <span className="about-page__purpose-icon" aria-hidden="true">
                <Target />
              </span>
              <div>
                <h3>Mission</h3>
                <p>
                  Make company administration clearer through guided work and visible ownership.
                </p>
              </div>
            </article>
            <article>
              <span className="about-page__purpose-icon" aria-hidden="true">
                <Eye />
              </span>
              <div>
                <h3>Vision</h3>
                <p>A more understandable way for businesses to manage their UAE company journey.</p>
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section className="about-page__values" aria-labelledby="about-values-title">
        <div className="container">
          <header className="about-page__section-heading">
            <span className="eyebrow eyebrow--accent">Our values</span>
            <h2 id="about-values-title">Principles behind the work.</h2>
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
            <h2 id="about-process-title">A guided journey from request to record.</h2>
          </header>
          <ol className="about-page__process-list">
            {processSteps.map((step, index) => (
              <li className="about-page__process-item" key={step.title}>
                <span className="about-page__process-icon" aria-hidden="true">
                  {step.icon}
                </span>
                <span className="about-page__process-number">Step {index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="about-page__team" aria-labelledby="about-team-title">
        <div className="container">
          <header className="about-page__section-heading about-page__section-heading--centered">
            <span className="eyebrow eyebrow--accent">How we work</span>
            <h2 id="about-team-title">Functions supporting the company journey.</h2>
            <p>Focused functions coordinate the platform and the service experience.</p>
          </header>
          <ul className="about-page__team-list">
            {teamFunctions.map((teamFunction) => (
              <li key={teamFunction.title}>
                <span className="about-page__team-icon" aria-hidden="true">
                  {teamFunction.icon}
                </span>
                <h3>{teamFunction.title}</h3>
                <p>{teamFunction.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PublicConversionBand
        headingId="about-conversion-title"
        title="Ready to plan your UAE business?"
        description="Start with an estimate or speak with Mandoob about the company journey ahead."
        primaryCta={{ label: 'Get an estimate', href: '/estimate' }}
        secondaryCta={{ label: 'Contact Mandoob', href: '/contact' }}
      />
    </>
  );
}
