import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileCheck2,
  FilePenLine,
  FileSearch,
  Globe2,
  Handshake,
  KeyRound,
  Landmark,
  Layers3,
  Rocket,
  Search,
  ShieldCheck,
  Store,
  TrendingUp,
  UserRoundCheck,
  Users,
} from 'lucide-react';

type Stat = { value: string; label: string; detail: string; icon: LucideIcon };
type Step = { title: string; description: string; icon: LucideIcon };
type SetupType = {
  id: 'mainland' | 'free-zone' | 'offshore';
  title: string;
  description: string;
  points: readonly string[];
  cta: string;
  href: string;
  icon: LucideIcon;
};
type Service = { title: string; description: string; icon: LucideIcon };

const stats: readonly Stat[] = [
  { value: '45+', label: 'Free zones', detail: 'Options compared', icon: Building2 },
  { value: '7–15', label: 'Working days', detail: 'Indicative timeline', icon: Clock3 },
  { value: '100%', label: 'Transparent', detail: 'Itemised estimates', icon: ShieldCheck },
  { value: '3', label: 'Setup routes', detail: 'Mainland · Free zone · Offshore', icon: Layers3 },
];

const quickSteps: readonly Step[] = [
  {
    title: 'Estimate cost',
    description: 'Get an indicative estimate based on your needs.',
    icon: Calculator,
  },
  {
    title: 'Share information',
    description: 'Complete a short online questionnaire.',
    icon: ClipboardList,
  },
  {
    title: 'Start your business',
    description: 'Your PRO handles the rest and keeps you updated.',
    icon: Rocket,
  },
];

const setupTypes: readonly SetupType[] = [
  {
    id: 'mainland',
    title: 'Mainland company',
    description: 'Operate across the UAE market, subject to your licensed activity.',
    points: [
      'Foreign ownership available for many activities',
      'Access to the UAE local market',
      'Trade with government and private sectors',
      'Wide range of licensed activities',
    ],
    cta: 'Explore mainland',
    href: '/mainland',
    icon: Landmark,
  },
  {
    id: 'free-zone',
    title: 'Free zone company',
    description: 'Full foreign ownership inside a dedicated economic zone.',
    points: [
      '100% foreign ownership',
      'Tax incentives in many zones',
      'Full profit repatriation',
      'Streamlined setup process',
    ],
    cta: 'Explore free zones',
    href: '/free-zones',
    icon: Store,
  },
  {
    id: 'offshore',
    title: 'Offshore company',
    description: 'International holding and asset structures outside the UAE market.',
    points: [
      'Foreign ownership',
      'Asset protection structures',
      'Holding and investment use',
      'International credibility',
    ],
    cta: 'Explore offshore',
    href: '/offshore',
    icon: Globe2,
  },
];

const services: readonly Service[] = [
  {
    title: 'Business registration',
    description: 'Complete registration of your company with the relevant authority.',
    icon: UserRoundCheck,
  },
  {
    title: 'License acquisition',
    description: 'Trade, professional, and industrial licenses.',
    icon: KeyRound,
  },
  {
    title: 'Visa services',
    description: 'Investor, employee, and family visa processing.',
    icon: Users,
  },
  {
    title: 'Document assistance',
    description: 'Drafting, attestation, and PRO document services.',
    icon: FilePenLine,
  },
  {
    title: 'Bank account opening',
    description: 'Assistance with corporate bank account setup.',
    icon: Landmark,
  },
  {
    title: 'VAT registration',
    description: 'VAT registration and compliance support.',
    icon: BadgeCheck,
  },
  {
    title: 'Renewal management',
    description: 'Timely renewals and compliance tracking.',
    icon: CalendarClock,
  },
  {
    title: 'PRO & government liaison',
    description: 'Dealing with government departments on your behalf.',
    icon: Handshake,
  },
];

const processSteps: readonly Step[] = [
  {
    title: 'Explore & estimate',
    description: 'Choose your business type and get an indicative cost estimate.',
    icon: Search,
  },
  {
    title: 'Share information',
    description: 'Fill out the questionnaire and upload required documents.',
    icon: FileSearch,
  },
  {
    title: 'Review & approvals',
    description: 'Your PRO reviews the application and handles approvals.',
    icon: UserRoundCheck,
  },
  {
    title: 'License issued',
    description: 'Your trade license and registration are issued.',
    icon: FileCheck2,
  },
  {
    title: 'Business ready',
    description: 'Start operations and focus on growing your business.',
    icon: TrendingUp,
  },
];

export function BusinessRegistrationServices() {
  return (
    <div className="setup-page bizreg-page">
      <section className="bizreg-hero" aria-labelledby="bizreg-title">
        <div className="bizreg-hero__media" aria-hidden="true">
          <Image
            src="/hero/skyline.webp"
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 900px) 60vw, 100vw"
          />
        </div>
        <div className="bizreg-hero__frame container">
          <nav className="setup-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li aria-current="page">Business registration</li>
            </ol>
          </nav>
          <div className="bizreg-hero__copy">
            <span className="eyebrow eyebrow--accent">Business registration in UAE</span>
            <h1 id="bizreg-title" className="bizreg-hero__title">
              Your complete business setup solution in the <em>UAE.</em>
            </h1>
            <p>
              Start, manage, and grow your business with confidence. We guide the registration
              process, document requirements, and approvals—so you can focus on your business.
            </p>
            <ul className="bizreg-stats" aria-label="Setup at a glance">
              {stats.map(({ value, label, detail, icon: Icon }) => (
                <li key={label}>
                  <span className="bizreg-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <strong>{value}</strong>
                  <span>{label}</span>
                  <small>{detail}</small>
                </li>
              ))}
            </ul>
            <div className="cta-row">
              <Link className="btn btn--accent btn--lg" href="/estimate">
                Calculate my setup cost
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link className="btn btn--outline btn--lg" href="/apply">
                Start registration
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <aside className="bizreg-quickstart" aria-labelledby="bizreg-quickstart-title">
            <h2 id="bizreg-quickstart-title">Get started in 3 simple steps</h2>
            <ol>
              {quickSteps.map(({ title, description, icon: Icon }, index) => (
                <li key={title}>
                  <span className="bizreg-icon bizreg-icon--ring" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="bizreg-badge" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <section className="bizreg-section" aria-labelledby="bizreg-types-title">
        <div className="container">
          <header className="bizreg-head">
            <h2 id="bizreg-types-title">Choose your business setup type</h2>
            <p>Select the structure that best fits your business goals.</p>
          </header>
          <div className="bizreg-types">
            {setupTypes.map(({ id, title, description, points, cta, href, icon: Icon }) => (
              <article className={`bizreg-type bizreg-type--${id}`} key={id}>
                <span className="bizreg-icon bizreg-icon--lg" aria-hidden="true">
                  <Icon />
                </span>
                <div className="bizreg-type__body">
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <ul>
                    {points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <Link className="bizreg-link" href={href}>
                    {cta}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        className="bizreg-section bizreg-section--tight"
        aria-labelledby="bizreg-services-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <h2 id="bizreg-services-title">Our business setup services</h2>
            <p>End-to-end support for a smooth and hassle-free setup.</p>
          </header>
          <ul className="bizreg-services">
            {services.map(({ title, description, icon: Icon }) => (
              <li key={title}>
                <span className="bizreg-icon" aria-hidden="true">
                  <Icon />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="bizreg-section bizreg-section--tight"
        aria-labelledby="bizreg-process-title"
      >
        <div className="container">
          <header className="bizreg-head">
            <h2 id="bizreg-process-title">Our process</h2>
            <p>A transparent process to get your business up and running.</p>
          </header>
          <ol className="bizreg-process">
            {processSteps.map(({ title, description, icon: Icon }, index) => (
              <li key={title}>
                <span className="bizreg-icon bizreg-icon--ring" aria-hidden="true">
                  <Icon />
                </span>
                <span className="bizreg-badge" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bizreg-cta-shell" aria-labelledby="bizreg-cta-title">
        <div className="container">
          <div className="bizreg-cta">
            <div className="bizreg-cta__media" aria-hidden="true">
              <Image src="/hero/skyline.webp" alt="" fill sizes="(min-width: 900px) 50vw, 100vw" />
            </div>
            <div className="bizreg-cta__copy">
              <h2 id="bizreg-cta-title">Ready to start your UAE business?</h2>
              <p>
                Get a clear estimate, understand your requirements, and start your registration
                journey today.
              </p>
            </div>
            <div className="cta-row">
              <Link className="btn btn--light btn--lg" href="/estimate">
                Calculate my setup cost
              </Link>
              <Link className="btn btn--light btn--lg" href="/apply">
                Start registration
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
