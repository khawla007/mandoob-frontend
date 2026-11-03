import Link from 'next/link';
import {
  ArrowUpRight,
  Headset,
  UsersRound,
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
  {
    title: 'Other inquiries',
    description: "Any other questions? We're happy to help.",
    icon: <MessageCircle />,
  },
] as const;

const quickLinks = [
  { label: 'Business Setup Guide', href: '/guides' },
  { label: 'Cost Estimator', href: '/estimate' },
  { label: 'Free Zones Directory', href: '/free-zones/directory' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Visa Information', href: '/document-requirements' },
  { label: 'Knowledge Base', href: '/knowledge-base' },
] as const;

type ContactPageBodyProps = {
  heroCopy: {
    eyebrow: string;
    title: string;
    description: string;
  };
  demoOutcome?: SyntheticContactOutcome;
  demoDelayMs?: number;
  proInterest?: boolean;
};

export function ContactPageBody({
  heroCopy,
  demoOutcome,
  demoDelayMs,
  proInterest = false,
}: ContactPageBodyProps) {
  return (
    <>
      <PageScenicHero
        className="about-page__hero contact-page__hero"
        headingId="contact-page-title"
        eyebrow={heroCopy.eyebrow}
        title={heroCopy.title}
        description={heroCopy.description}
        currentLabel="Contact Us"
        imageSrc="/hero/skyline.webp"
        imageAlt="Dubai skyline at sunset"
        features={[
          {
            title: 'Quick Response',
            description: 'one business day',
            icon: <MessageCircle />,
          },
          {
            title: 'Expert Guidance',
            description: 'business setup experts',
            icon: <UsersRound />,
          },
          {
            title: 'Confidential',
            description: 'always protected',
            icon: <ShieldCheck />,
          },
          {
            title: 'Dedicated Support',
            description: 'every step',
            icon: <Headset />,
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
            <ContactForm
              demoOutcome={demoOutcome}
              demoDelayMs={demoDelayMs}
              initialTopic={proInterest ? 'pro-interest' : undefined}
            />
          </div>

          <aside className="contact-page__help" aria-labelledby="contact-help-title">
            <h2 id="contact-help-title">How We Can Help You</h2>
            <p>Our business setup specialists can assist you with:</p>
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
            <h2>Quick Links</h2>
            <p>Find answers to common questions.</p>
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
        title="Ready to Start Your UAE Business?"
        description="Get a clear estimate and our experts will guide you every step of the way."
        primaryCta={{ label: 'Calculate My Setup Cost', href: '/estimate' }}
        secondaryCta={{ label: 'Explore help guidance', href: '/knowledge-base' }}
      />
    </>
  );
}
