import {
  BadgeInfo,
  Building2,
  CreditCard,
  FileClock,
  Files,
  IdCard,
  Palette,
  UsersRound,
} from 'lucide-react';

import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';
import type { PublicProCapabilityId } from '@/lib/pro/public-pro';

const capabilityIcons = {
  'legal-company-profile': Building2,
  'employees-visa-eid': IdCard,
  'documents-storage': Files,
  renewals: FileClock,
  'invoices-payments': CreditCard,
  'branding-contact': Palette,
  'audit-visibility': BadgeInfo,
  'portal-context': UsersRound,
} as const satisfies Record<PublicProCapabilityId, typeof Building2>;

export function ProCapabilitiesSection() {
  const capabilities = PUBLIC_PRO_CONTENT.capabilities;

  return (
    <section
      id="pro-capabilities"
      className="pro-capabilities"
      aria-labelledby="pro-capabilities-title"
    >
      <div className="container">
        <header className="pro-section-heading reveal">
          <span className="eyebrow eyebrow--accent">{capabilities.eyebrow}</span>
          <h2 id="pro-capabilities-title">{capabilities.title}</h2>
          <p>{capabilities.description}</p>
        </header>
        <ul className="pro-capabilities__grid" role="list" data-reveal-cards>
          {capabilities.items.map((item, index) => {
            const Icon = capabilityIcons[item.id];
            return (
              <li className="reveal" data-pro-capability={item.id} key={item.id}>
                <span className="pro-card-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="pro-capabilities__index mono" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
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
