import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Mandoob',
  description: 'Learn how Mandoob supports UAE company setup and business administration.',
  alternates: { canonical: 'https://mandoob.ae/about' },
};

export default function AboutPage() {
  return (
    <section className="section" aria-labelledby="about-title">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">About Mandoob</span>
          <h1 id="about-title" className="h2">
            Practical support for UAE businesses.
          </h1>
          <p className="lede">
            Mandoob brings company setup guidance and business administration into one clear
            workspace.
          </p>
        </header>
        <div className="cta-row">
          <Link className="btn btn--accent" href="/estimate">
            Get an estimate
          </Link>
          <Link className="btn btn--outline" href="/contact">
            Contact Mandoob
          </Link>
        </div>
      </div>
    </section>
  );
}
