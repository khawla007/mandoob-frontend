import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Contact Mandoob',
  description: 'Find the current ways to continue your UAE company setup journey with Mandoob.',
  alternates: { canonical: 'https://mandoob.ae/contact' },
};

export default async function ContactPage() {
  const tContact = await getTranslations('contact');
  const tSite = await getTranslations('site');

  return (
    <section className="section" aria-labelledby="contact-title">
      <div className="container">
        <header className="section__head">
          <span className="eyebrow">{tContact('eyebrow')}</span>
          <h1 id="contact-title" className="h2">
            {tContact('title')}
          </h1>
          <p className="lede">{tSite('footer.description')}</p>
        </header>
        <Link className="btn btn--accent" href="/estimate">
          {tSite('getEstimate')}
        </Link>
      </div>
    </section>
  );
}
