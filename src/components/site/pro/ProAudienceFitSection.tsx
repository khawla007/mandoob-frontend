import { BadgeCheck, Building2, UserRoundCheck } from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';
import type { PublicProAudienceId } from '@/lib/pro/public-pro';

type IconComponent = typeof BadgeCheck;

const audienceIcons = {
  'verified-operations': BadgeCheck,
  'one-company-assignment': UserRoundCheck,
  'bounded-access': Building2,
} as const satisfies Record<PublicProAudienceId, IconComponent>;

export function ProAudienceFitSection() {
  const audience = PUBLIC_PRO_CONTENT.audience;

  return (
    <section id="pro-fit" className="pro-fit" aria-labelledby="pro-fit-title">
      <div className="container">
        <header className="pro-section-heading reveal">
          <span className="eyebrow eyebrow--accent">{audience.eyebrow.text}</span>
          <h2 id="pro-fit-title">{audience.title.text}</h2>
          <p>{audience.description.text}</p>
        </header>
        <ul className="pro-fit__grid" role="list" data-reveal-cards>
          {audience.items.map((item) => {
            const Icon = audienceIcons[item.id];
            return (
              <li className="reveal" data-pro-fit={item.id} key={item.id}>
                <span className="pro-card-icon" aria-hidden="true">
                  <Icon />
                </span>
                <h3>{item.title.text}</h3>
                <p>{item.description.text}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
