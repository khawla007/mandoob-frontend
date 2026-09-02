import Link from 'next/link';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

export function ProBenefitsFaqSection() {
  const { benefits, packages, faq } = PUBLIC_PRO_CONTENT;

  return (
    <>
      <section
        id="pro-benefits-packages"
        className="pro-benefits"
        aria-labelledby="pro-benefits-title"
      >
        <div className="container">
          <header className="pro-section-heading">
            <span className="eyebrow">{benefits.eyebrow.text}</span>
            <h2 id="pro-benefits-title">{benefits.title.text}</h2>
            <p>{benefits.description.text}</p>
          </header>

          <ul className="pro-benefits__grid" role="list">
            {benefits.items.map((item) => (
              <li key={item.id} data-pro-benefit={item.id}>
                <h3>{item.title.text}</h3>
                <p>{item.description.text}</p>
              </li>
            ))}
          </ul>

          <div className="pro-packages" aria-labelledby="pro-packages-title">
            <header className="pro-packages__head">
              <span className="eyebrow">{packages.eyebrow.text}</span>
              <h3 id="pro-packages-title">{packages.title.text}</h3>
              <p data-source-state={packages.description.source.state}>
                {packages.description.text}
              </p>
            </header>
            <ul className="pro-packages__tiers" role="list">
              {packages.tiers.map((tier) => (
                <li key={tier.id} data-pro-package={tier.id}>
                  <strong>{tier.name}</strong>
                  <span>{tier.companyPolicy}</span>
                  <span data-source-state={tier.allocation.source.state}>
                    {tier.allocation.text}
                  </span>
                </li>
              ))}
            </ul>
            <Link className="cell__link" href={packages.link.href}>
              {packages.link.label.text}
            </Link>
          </div>
        </div>
      </section>

      <section id="pro-faq" className="pro-faq" aria-labelledby="pro-faq-title">
        <div className="container">
          <header className="pro-section-heading pro-section-heading--centered">
            <span className="eyebrow">{faq.eyebrow.text}</span>
            <h2 id="pro-faq-title">{faq.title.text}</h2>
            <p data-source-state={faq.description.source.state}>{faq.description.text}</p>
          </header>
          <div className="pro-faq__grid">
            {faq.items.map((item) => (
              <details key={item.id} className="pro-faq__item" data-pro-faq={item.id}>
                <summary>{item.question.text}</summary>
                <div className="pro-faq__answer">
                  {item.answer.fragments.map((fragment) => (
                    <p key={fragment.text} data-source-state={fragment.source.state}>
                      {fragment.text}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
