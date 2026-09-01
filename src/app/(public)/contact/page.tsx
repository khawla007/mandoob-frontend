import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact Mandoob',
  description: 'Find the current ways to continue your UAE company setup journey with Mandoob.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <section className="section" aria-labelledby="contact-title">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">Contact Mandoob</span>
          <h1 id="contact-title" className="h2">
            Start with your company setup needs.
          </h1>
          <p className="lede">
            Use the estimator to share the setup details that matter to your business.
          </p>
        </header>
        <Link className="btn btn--accent" href="/estimate">
          Get an estimate
        </Link>
      </div>
    </section>
  );
}
