import { BadgeCheck, Building2, UserRoundCheck } from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

const icons = [BadgeCheck, UserRoundCheck, Building2] as const;

export function ProAudienceFitSection() {
  const audience = PUBLIC_PRO_CONTENT.audience;

  return (
    <section id="pro-fit" className="pro-fit" aria-labelledby="pro-fit-title">
      <div className="container">
        <header className="pro-section-heading reveal">
          <span className="eyebrow eyebrow--accent">{audience.eyebrow}</span>
          <h2 id="pro-fit-title">{audience.title}</h2>
          <p>{audience.description}</p>
        </header>
        <ul className="pro-fit__grid" role="list" data-reveal-cards>
          {audience.items.map((item, index) => {
            const Icon = icons[index];
            return (
              <li className="reveal" data-pro-fit={item.id} key={item.id}>
                <span className="pro-card-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
