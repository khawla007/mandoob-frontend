import Link from 'next/link';
import {
  ArrowUpRight,
  Building2,
  Calculator,
  Clock3,
  FileCheck2,
  FileSearch,
  Landmark,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Route,
  ShieldCheck,
} from 'lucide-react';

import { ContactForm } from '@/components/contact/ContactForm';
import type { SyntheticContactOutcome } from '@/lib/public-contact/demo-adapter';

import { PageScenicHero } from '../about-contact/PageScenicHero';
import { PublicConversionBand } from '../about-contact/PublicConversionBand';
import { RaisedInfoStrip } from '../about-contact/RaisedInfoStrip';

const unavailableStatus = 'Unavailable';

const contactChannels = [
  {
    title: 'Office location',
    description: (
      <>
        <strong className="contact-page__channel-status">{unavailableStatus}</strong>
        <span>No verified office location is published on this page.</span>
      </>
    ),
    icon: <MapPin />,
  },
  {
    title: 'Phone',
    description: (
      <>
        <strong className="contact-page__channel-status">{unavailableStatus}</strong>
        <span>No verified phone destination is published on this page.</span>
      </>
    ),
    icon: <Phone />,
  },
  {
    title: 'Email',
    description: (
      <>
        <strong className="contact-page__channel-status">{unavailableStatus}</strong>
        <span>No verified email destination is published on this page.</span>
      </>
    ),
    icon: <Mail />,
  },
  {
    title: 'WhatsApp',
    description: (
      <>
        <strong className="contact-page__channel-status">{unavailableStatus}</strong>
        <span>No verified WhatsApp destination is published on this page.</span>
      </>
    ),
    icon: <MessageCircle />,
  },
  {
    title: 'Hours',
    description: (
      <>
        <strong className="contact-page__channel-status">{unavailableStatus}</strong>
        <span>No verified availability schedule is published on this page.</span>
      </>
    ),
    icon: <Clock3 />,
  },
] as const;

const helpCategories = [
  {
    title: 'Company setup',
    description: 'Share the company activity and jurisdiction you are considering.',
    icon: <Building2 />,
  },
  {
    title: 'Cost estimate',
    description: 'Request an estimate based on the details you can provide.',
    icon: <Calculator />,
  },
  {
    title: 'Document requirements',
    description: 'Ask which information may be relevant to your setup path.',
    icon: <FileSearch />,
  },
  {
    title: 'Visa and immigration guidance',
    description: 'Discuss the administrative steps that may apply to your circumstances.',
    icon: <FileCheck2 />,
  },
  {
    title: 'Banking requirements guidance',
    description:
      'Review preparation considerations; bank requirements and decisions remain subject to each bank.',
    icon: <Landmark />,
  },
  {
    title: 'Licence renewal',
    description: 'Organize the details needed to understand a renewal request.',
    icon: <ShieldCheck />,
  },
] as const;

const quickLinks = [
  { label: 'Get an estimate', href: '/estimate' },
  { label: 'Mainland setup', href: '/mainland' },
  { label: 'Free zone setup', href: '/free-zones' },
  { label: 'Offshore setup', href: '/offshore' },
  { label: 'Knowledge base', href: '/knowledge-base' },
  { label: 'Start an application', href: '/apply' },
] as const;

type ContactPageBodyProps = {
  heroCopy: {
    eyebrow: string;
    title: string;
    description: string;
  };
  demoOutcome?: SyntheticContactOutcome;
  demoDelayMs?: number;
};

export function ContactPageBody({ heroCopy, demoOutcome, demoDelayMs }: ContactPageBodyProps) {
  return (
    <>
      <PageScenicHero
        className="contact-page__hero"
        headingId="contact-page-title"
        eyebrow={heroCopy.eyebrow}
        title={heroCopy.title}
        description={heroCopy.description}
        currentLabel="Contact"
        imageSrc="/hero/skyline.webp"
        imageAlt="Dubai skyline at sunset"
        features={[
          {
            title: 'Company setup',
            description: 'Clarify a possible setup path',
            icon: <Building2 />,
          },
          {
            title: 'Document guidance',
            description: 'Organize relevant information',
            icon: <FileCheck2 />,
          },
          {
            title: 'Cost planning',
            description: 'Request a tailored estimate',
            icon: <Calculator />,
          },
          {
            title: 'PRO coordination',
            description: 'Understand available next actions',
            icon: <Route />,
          },
        ]}
      />

      <RaisedInfoStrip
        headingId="contact-channels-title"
        heading="Contact channels"
        items={contactChannels}
      />

      <section className="contact-page__workspace" aria-label="Send a message and help topics">
        <div className="contact-page__workspace-grid container">
          <div className="contact-page__form-panel">
            <ContactForm demoOutcome={demoOutcome} demoDelayMs={demoDelayMs} />
          </div>

          <aside className="contact-page__help" aria-labelledby="contact-help-title">
            <span className="eyebrow eyebrow--accent">How we can help you</span>
            <h2 id="contact-help-title">Choose the topic closest to your request.</h2>
            <p>
              These topics describe the guidance you can request. Outcomes remain dependent on the
              relevant information and third-party requirements.
            </p>
            <ul className="contact-page__help-list">
              {helpCategories.map((category) => (
                <li key={category.title}>
                  <span className="contact-page__help-icon" aria-hidden="true">
                    {category.icon}
                  </span>
                  <div>
                    <h3>{category.title}</h3>
                    <p>{category.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="contact-page__support-row" aria-label="Other ways to continue">
        <div className="contact-page__support-grid container">
          <article className="contact-page__whatsapp">
            <span className="contact-page__support-icon" aria-hidden="true">
              <MessageCircle />
            </span>
            <div>
              <span className="eyebrow eyebrow--accent">WhatsApp</span>
              <h2>WhatsApp is unavailable</h2>
              <p>
                Mandoob does not currently publish a verified WhatsApp destination on this page.
              </p>
            </div>
          </article>

          <article className="contact-page__quick-links">
            <span className="eyebrow eyebrow--accent">Quick links</span>
            <h2>Continue with a working route.</h2>
            <ul>
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>
                    {link.label}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <PublicConversionBand
        headingId="contact-conversion-title"
        title="Ready to organize your company setup?"
        description="Start with an estimate or explore guidance for common UAE company setup questions."
        primaryCta={{ label: 'Get an estimate', href: '/estimate' }}
        secondaryCta={{ label: 'Explore help guidance', href: '/knowledge-base' }}
      />
    </>
  );
}
