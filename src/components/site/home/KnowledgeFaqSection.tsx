import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function KnowledgeFaqSection() {
  const knowledge = await getTranslations('home.knowledge');
  const faq = await getTranslations('home.faq');

  return (
    <section id="customers" className="section" aria-labelledby="knowledge-h">
      <div className="container">
        <header className="section__head reveal">
          <span className="eyebrow eyebrow--accent">{knowledge('eyebrow')}</span>
          <h2 id="knowledge-h" className="h2">
            {knowledge('title')}
          </h2>
          <p className="section__lede">{knowledge('lede')}</p>
        </header>
        <div className="home-knowledge-grid cards-stagger" data-reveal-cards>
          <article className="cell reveal">
            <h3>{knowledge('kbTitle')}</h3>
            <p>{knowledge('kbText')}</p>
            <Link className="cell__link" href="/knowledge-base">
              {knowledge('kbCta')} <span aria-hidden="true">↗</span>
            </Link>
          </article>
          <article className="cell reveal">
            <h3>{knowledge('blogTitle')}</h3>
            <p>{knowledge('blogText')}</p>
            <Link className="cell__link" href="/blog">
              {knowledge('blogCta')} <span aria-hidden="true">↗</span>
            </Link>
          </article>
          <aside className="cell home-principles reveal" aria-labelledby="principles-h">
            <h3 id="principles-h">{knowledge('principlesTitle')}</h3>
            <ul role="list">
              {[1, 2, 3, 4].map((item) => (
                <li key={item}>{knowledge(`principle${item}`)}</li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="home-faq" aria-labelledby="faq-h">
          <h3 id="faq-h" className="home-faq__heading">
            {faq('heading')}
          </h3>
          <div className="home-faq__grid">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <details className="cell" key={item}>
                <summary>{faq(`q${item}`)}</summary>
                <p>{faq(`a${item}`)}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
