import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

const ARTICLES = [
  { key: 'card1', image: '/home-reference/business-setup-hd.png', href: '/knowledge-base' },
  { key: 'card2', image: '/home-reference/free-zone-hd.png', href: '/knowledge-base' },
  { key: 'card3', image: '/home-reference/pro-services-hd.png', href: '/blog' },
  { key: 'card4', image: '/home-reference/vat-registration-hd.png', href: '/blog' },
] as const;

export async function KnowledgeFaqSection() {
  const knowledge = await getTranslations('home.knowledge');
  const faq = await getTranslations('home.faq');

  return (
    <section id="customers" className="home-knowledge-section" aria-labelledby="knowledge-h">
      <div className="container">
        <header className="home-knowledge-head reveal">
          <div>
            <h2 id="knowledge-h" className="home-section-title">
              {knowledge('title')}
            </h2>
          </div>
          <Link className="home-text-link" href="/knowledge-base">
            {knowledge('viewAll')} <span aria-hidden="true">→</span>
          </Link>
        </header>

        <div className="home-knowledge-grid cards-stagger" data-reveal-cards>
          {ARTICLES.map(({ key, image, href }) => (
            <article className="home-knowledge-card reveal" key={key}>
              <div className="home-knowledge-card__media">
                <Image
                  src={image}
                  alt={knowledge(`${key}Alt`)}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1100px) 50vw, 25vw"
                />
              </div>
              <div className="home-knowledge-card__body">
                <h3>{knowledge(`${key}Title`)}</h3>
                <p>{knowledge(`${key}Text`)}</p>
                <Link className="home-text-link" href={href}>
                  {knowledge('readMore')} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="home-faq" aria-labelledby="faq-h">
          <h3 id="faq-h" className="home-section-title">
            {faq('heading')}
          </h3>
          <div className="home-faq__grid">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <details key={item}>
                <summary>{faq(`q${item}`)}</summary>
                <p>{faq(`a${item}`)}</p>
              </details>
            ))}
          </div>
          <Link className="home-faq__link home-text-link" href="/knowledge-base">
            {faq('viewAll')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
