import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  FileText,
  Headset,
  ListChecks,
  MonitorSmartphone,
  Phone,
  ReceiptText,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';
import { CostEstimator } from '@/components/estimator/CostEstimator';
import { getPublicEstimatorSource } from '@/lib/estimator/public-catalog';
import { EMPTY_ESTIMATOR_DRAFT, parseEstimatorPrefill } from '@/lib/estimator/public-draft';

export const metadata: Metadata = {
  title: 'UAE Company Setup Cost Estimator | Mandoob',
  description:
    'Build an indicative UAE company setup estimate with itemized assumptions, recurring costs, timeline guidance, and document requirements.',
  alternates: { canonical: '/estimate' },
};

type EstimateSearchParams = Record<string, string | string[] | undefined>;

export default async function EstimatePage({
  searchParams,
}: {
  searchParams: Promise<EstimateSearchParams>;
}) {
  const search = await searchParams;
  const evidenceState =
    process.env.NODE_ENV === 'development' &&
    typeof search.__estimator_state === 'string' &&
    ['unavailable', 'error', 'no-match'].includes(search.__estimator_state)
      ? (search.__estimator_state as 'unavailable' | 'error' | 'no-match')
      : undefined;
  const source = getPublicEstimatorSource(process.env.NODE_ENV, evidenceState);
  const initialDraft =
    source.status === 'ready' || source.status === 'indicative-demo'
      ? { ...EMPTY_ESTIMATOR_DRAFT, ...parseEstimatorPrefill(search, source.catalog) }
      : EMPTY_ESTIMATOR_DRAFT;

  return (
    <div className="estimator-page">
      <section id="estimator-hero" className="estimator-hero" aria-labelledby="estimator-title">
        <div className="estimator-hero__media" aria-hidden="true">
          <Image
            src="/hero/skyline.webp"
            alt=""
            fill
            preload={true}
            sizes="(min-width: 900px) 55vw, 100vw"
          />
        </div>
        <div className="container">
          <nav className="estimator-breadcrumb" aria-label="Breadcrumb">
            <ol>
              <li>
                <Link href="/">Home</Link>
              </li>
              <li aria-current="page">Cost Estimator</li>
            </ol>
          </nav>
          <div className="estimator-hero__copy">
            <h1 id="estimator-title">UAE Business Setup Cost Estimator</h1>
            <p>
              Get an instant, detailed estimate for your company setup in Mainland, Free Zone or
              Offshore.
            </p>
            <ul className="estimator-hero__features" aria-label="Estimator features">
              {HERO_FEATURES.map(({ title, detail, icon: Icon }) => (
                <li key={title}>
                  <span aria-hidden="true">
                    <Icon />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CostEstimator source={source} initialDraft={initialDraft} />

      <section
        id="estimator-assurance"
        className="estimator-assurance"
        aria-labelledby="estimator-assurance-title"
      >
        <div className="container">
          <div className="estimator-why">
            <header className="estimator-why__head">
              <span className="eyebrow eyebrow--accent">Why use our cost estimator?</span>
              <h2 id="estimator-assurance-title">Why Use Our Cost Estimator?</h2>
              <p>Transparent pricing, guided choices and shareable estimates.</p>
            </header>
            <ul>
              {WHY_ITEMS.map(({ title, detail, icon: Icon }) => (
                <li key={title}>
                  <span aria-hidden="true">
                    <Icon />
                  </span>
                  <h3>{title}</h3>
                  <p>{detail}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="estimator-help-band">
            <span className="estimator-help-band__art" aria-hidden="true">
              <Headset />
            </span>
            <div className="estimator-help-band__copy">
              <h2>Need Help Choosing the Right Option?</h2>
              <p>
                Our business setup team can help you review your options. Costs and timelines are
                confirmed against current authority requirements before you proceed.
              </p>
              <div className="estimator-help-band__actions">
                <Link className="btn btn--outline" href="/contact">
                  <Headset aria-hidden="true" /> Talk to an expert
                </Link>
                <a className="btn btn--outline" href="tel:+97145550123">
                  <Phone aria-hidden="true" /> <bdi>+971 4 555 0123</bdi>
                </a>
              </div>
            </div>
            <div className="estimator-help-band__aside">
              <ShieldCheck aria-hidden="true" />
              <strong>Ready when you are</strong>
              <p>Continue to the application with your estimate attached.</p>
              <Link className="btn btn--accent" href="/apply">
                Start registration
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const HERO_FEATURES = [
  { title: 'Itemised estimate', detail: 'One-time and recurring costs', icon: ReceiptText },
  { title: 'Assumptions shown', detail: 'Not a quote or invoice', icon: ListChecks },
  { title: 'Save & resume', detail: 'Stored on this device', icon: Save },
] as const;

const WHY_ITEMS = [
  {
    title: 'Itemised breakdown',
    detail: 'See each one-time and recurring cost line.',
    icon: ReceiptText,
  },
  {
    title: 'Visible assumptions',
    detail: 'Every estimate lists what it includes and excludes.',
    icon: FileText,
  },
  { title: 'Save & resume', detail: 'Keep a draft on this device for 30 days.', icon: Save },
  {
    title: 'Stays on your device',
    detail: 'Nothing is sent until you continue to the application.',
    icon: MonitorSmartphone,
  },
  {
    title: 'Expert support',
    detail: 'Our team can help you review your options.',
    icon: UserRoundCheck,
  },
] as const;
