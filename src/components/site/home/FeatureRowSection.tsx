import {
  BadgePercent,
  Building2,
  ClipboardList,
  Clock3,
  Headset,
  IdCard,
  Landmark,
  MonitorCheck,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';

const SECTIONS = {
  confidence: {
    id: 'confidence',
    layout: 'cards',
    items: [
      ['setup', Building2],
      ['pro', ClipboardList],
      ['bank', Landmark],
      ['vat', BadgePercent],
      ['visa', IdCard],
      ['renewal', RefreshCw],
      ['guidance', Headset],
    ],
  },
  beyond: {
    id: 'beyond',
    layout: 'inline',
    items: [
      ['expert', UsersRound],
      ['pricing', ReceiptText],
      ['support', Headset],
      ['fast', Clock3],
      ['online', MonitorCheck],
      ['secure', ShieldCheck],
    ],
  },
} as const satisfies Record<
  string,
  {
    id: string;
    layout: 'cards' | 'inline';
    items: readonly (readonly [string, LucideIcon])[];
  }
>;

type FeatureRowSectionProps = {
  variant: keyof typeof SECTIONS;
};

/**
 * Centered eyebrow/heading/lede followed by icon + copy items. `cards` renders a
 * seven-up strip of bordered, centered tiles; `inline` renders a 3-column
 * icon-beside-copy grid.
 */
export async function FeatureRowSection({ variant }: FeatureRowSectionProps) {
  const { id, layout, items } = SECTIONS[variant];
  const t = await getTranslations(`home.${variant}`);
  const headingId = `home-${id}-h`;

  return (
    <section
      className={`home-feature-row-section home-feature-row-section--${id}`}
      aria-labelledby={headingId}
    >
      <div className="container">
        <header className="home-centered-head reveal">
          <span className="eyebrow eyebrow--accent">{t('eyebrow')}</span>
          <h2 id={headingId} className="home-section-title home-feature-row-section__title">
            {t('title')}
          </h2>
          <p>{t('lede')}</p>
        </header>
        <ul
          className={`home-feature-row home-feature-row--${layout}`}
          role="list"
          data-reveal-cards
        >
          {items.map(([key, Icon], index) => (
            <li className="reveal" key={key} style={{ '--reveal-i': index } as CSSProperties}>
              <span className={`home-icon-medallion home-icon-medallion--${index + 1}`}>
                <Icon aria-hidden="true" />
              </span>
              <div>
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
